#!/usr/bin/env python3
"""
Seed or refresh the Supabase database with Created Cases Report data.

Usage:
  # Set env vars (or put in .env.local)
  export NEXT_PUBLIC_SUPABASE_URL=https://ucsbezjalvewvksrjqgl.supabase.co
  export SUPABASE_SERVICE_ROLE_KEY=<from Supabase dashboard → Settings → API>

  # Run
  python scripts/seed.py --current path/to/Created_Cases_YTD.xlsx \
                        --prior   path/to/2025_Full_Year.xlsx \
                        --npi-cache path/to/npi_specialties.csv

Upserts by patient_account_number (cases) and npi (physicians), so running
the script repeatedly with fresh exports just updates visit counts and adds
new cases — no duplicates.
"""
import argparse, os, sys, pandas as pd, requests, json

DEPARTED = {'1407495492','1528080777'}

def norm_cases(df: pd.DataFrame) -> pd.DataFrame:
    df['arrived_visits']   = pd.to_numeric(df.get('Arrived Visits',0),   errors='coerce').fillna(0).astype(int)
    df['scheduled_visits'] = pd.to_numeric(df.get('Scheduled Visits',0), errors='coerce').fillna(0).astype(int)
    for src, dst in [
        ('Created Date','created_date'), ('Date of Initial Eval','date_of_initial_eval'),
        ('Date of First Scheduled Visit','date_of_first_scheduled_visit'),
        ('Date of First Arrived Visit','date_of_first_arrived_visit'),
        ('Discharge Date','discharge_date'),
    ]:
        df[dst] = pd.to_datetime(df.get(src), errors='coerce').dt.date.astype(object).where(pd.notna(pd.to_datetime(df.get(src), errors='coerce')), None)
    df['referring_doctor_npi'] = df['Referring Doctor NPI'].astype(str).str.replace(r'\.0$','',regex=True).replace({'nan':'','None':''}).replace({'': None})
    col_map = {
      'Patient Account Number':'patient_account_number','Patient Name':'patient_name',
      'Case Title':'case_title','Case Therapist':'case_therapist','Case Facility':'case_facility',
      'Case Status':'case_status','Discipline':'discipline','Patient Diagnosis Category':'patient_diagnosis_category',
      'Primary Insurance':'primary_insurance','Primary Payer Type':'primary_payer_type',
      'Primary Plan Name':'primary_plan_name','Secondary Payer Type':'secondary_payer_type',
      'Referring Doctor':'referring_doctor_name','Referral Source':'referral_source',
      'Discharge Reason':'discharge_reason','Discharge Note Generated':'discharge_note_generated',
      'Missed Visit Alerted':'missed_visit_alerted','RTM Status':'rtm_status','Related Cause':'related_cause',
    }
    df = df.rename(columns=col_map)
    keep = ['patient_account_number','patient_name','case_title','case_therapist','case_facility',
            'case_status','discipline','patient_diagnosis_category','primary_insurance',
            'primary_payer_type','primary_plan_name','secondary_payer_type','referring_doctor_name',
            'referring_doctor_npi','referral_source','arrived_visits','scheduled_visits',
            'created_date','date_of_initial_eval','date_of_first_scheduled_visit',
            'date_of_first_arrived_visit','discharge_date','discharge_reason',
            'discharge_note_generated','missed_visit_alerted','rtm_status','related_cause']
    return df[[c for c in keep if c in df.columns]]

def extract_physicians(df, spec_map):
    out = {}
    # Extract ALL NPIs across any referral source — cases table FK requires the row to exist.
    with_npi = df[df['referring_doctor_npi'].notna() & (df['referring_doctor_npi'] != '')]
    for npi, g in with_npi.groupby('referring_doctor_npi'):
        if not npi: continue
        name = g['referring_doctor_name'].mode().iloc[0] if len(g['referring_doctor_name'].mode())>0 else ''
        info = spec_map.get(npi, {})
        out[npi] = {
            'npi': npi, 'name': name,
            'specialty': info.get('Specialty') or None,
            'taxonomy_code': info.get('TaxonomyCode') or None,
            'credential': info.get('Credential') or None,
            'city': info.get('City') or None,
            'state': info.get('State') or None,
            'postal_code': str(info.get('PostalCode')) if info.get('PostalCode') else None,
            'phone': info.get('Phone') or None,
            'departed': npi in DEPARTED,
            'departure_note': (
                'Departed May 2025' if npi=='1407495492' else
                'No longer practicing (Apr 2026)' if npi=='1528080777' else None
            ),
        }
    return list(out.values())

def chunked(seq, size):
    for i in range(0, len(seq), size):
        yield seq[i:i+size]

def upsert(url, key, table, rows, on_conflict):
    if not rows: return 0
    endpoint = f"{url}/rest/v1/{table}?on_conflict={on_conflict}"
    headers = {
        'apikey': key, 'Authorization': f'Bearer {key}',
        'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=minimal'
    }
    total = 0
    for batch in chunked(rows, 200):
        # Convert any non-serializable types
        payload = [{k: (v.isoformat() if hasattr(v,'isoformat') else (None if pd.isna(v) else v)) for k,v in row.items()} for row in batch]
        r = requests.post(endpoint, headers=headers, json=payload)
        if r.status_code not in (200, 201, 204):
            print(f"ERROR {table}: HTTP {r.status_code}\n{r.text[:500]}")
            sys.exit(1)
        total += len(batch)
        print(f"  {table}: {total}/{len(rows)}")
    return total

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--current', required=True, help='Current period Created Cases Report XLSX')
    ap.add_argument('--prior', help='Prior period (optional; for backfill)')
    ap.add_argument('--npi-cache', help='CSV with NPPES enrichment (NPI, Specialty, City, State, Phone, etc.)')
    args = ap.parse_args()

    url = os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or os.environ.get('SUPABASE_URL')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    if not url or not key:
        print("ERROR: set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env vars")
        sys.exit(1)

    spec_map = {}
    if args.npi_cache and os.path.exists(args.npi_cache):
        sm = pd.read_csv(args.npi_cache, dtype={'NPI':str})
        spec_map = sm.set_index('NPI').to_dict(orient='index')

    frames = []
    for f in [args.current, args.prior]:
        if f and os.path.exists(f):
            print(f"Loading {f}...")
            df = pd.read_excel(f)
            frames.append(norm_cases(df))
    df_all = pd.concat(frames, ignore_index=True).drop_duplicates(subset='patient_account_number')
    print(f"Total unique cases: {len(df_all)}")

    phys = extract_physicians(df_all, spec_map)
    print(f"Extracting {len(phys)} physicians...")
    upsert(url, key, 'physicians', phys, 'npi')

    cases = df_all.to_dict(orient='records')
    # Drop rows without patient_account_number
    cases = [c for c in cases if c.get('patient_account_number')]
    # Null out referring_doctor_npi when empty
    for c in cases:
        if not c.get('referring_doctor_npi'): c['referring_doctor_npi'] = None
    print(f"Seeding {len(cases)} cases...")
    upsert(url, key, 'cases', cases, 'patient_account_number')
    print("Done.")

if __name__ == '__main__':
    main()
