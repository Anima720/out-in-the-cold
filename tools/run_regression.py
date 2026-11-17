"""Run the handoff's browser checks serially; each command owns one browser and a 900 s budget.
Usage: python3 tools/run_regression.py [case-name ...] [--timeout seconds]
Logs and summary.json are written under shots/regression/ (ignored by git).
"""
import argparse, json, os, pathlib, signal, subprocess, sys, time
from runtime import ROOT
CASES = {
    'mine_surface': ['playtest_mine_surface.py'],
    'train': ['playtest_train.py'],
    'last_stand': ['playtest_last_stand.py'],
    'assault_1': ['playtest_assault.py', '--part', '1'],
    'assault_2': ['playtest_assault.py', '--part', '2'],
    'assault_3': ['playtest_assault.py', '--part', '3'],
    'finale': ['capture_finale.py'],
    'epilogue': ['capture_epilogue.py'],
    'weapons_logic': ['test_weapons.py', 'logic'],
    'weapons_shots': ['test_weapons.py', 'shots'],
    'weapons_npc': ['test_weapons.py', 'npc'],
    'crowd': ['test_crowd.py'],
    'blood_fence': ['test_blood_fence.py'],
    't_quick': ['t_quick.py'],
    't_cage': ['t_cage.py', 'low'],
    't_cab': ['t_cab.py', 'low'],
    't_bridge': ['t_bridge.py', 'low'],
    'ai': ['test_ai.py'],
    'ai_shots': ['shot_ai.py'],
    'review_shots': ['capture_review.py'],
}

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('cases', nargs='*', choices=None)
    ap.add_argument('--timeout', type=int, default=900)
    args=ap.parse_args()
    names=args.cases or list(CASES)
    unknown=set(names)-set(CASES)
    if unknown: ap.error('Unknown cases: '+', '.join(sorted(unknown)))
    dest=ROOT/'shots'/'regression';dest.mkdir(parents=True,exist_ok=True)
    results=[]
    for name in names:
        argv=[sys.executable,'-u',str(ROOT/'tools'/CASES[name][0]),*CASES[name][1:]]
        start=time.monotonic(); timed_out=False
        print('RUN',name,flush=True)
        with (dest/(name+'.log')).open('w') as log:
            proc=subprocess.Popen(argv,cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
            try: code=proc.wait(timeout=args.timeout)
            except subprocess.TimeoutExpired:
                timed_out=True
                os.killpg(proc.pid,signal.SIGKILL)
                code=proc.wait()
            finally:
                # Also reap Chromium descendants after a test failed before its close path.
                try: os.killpg(proc.pid,signal.SIGTERM)
                except ProcessLookupError: pass
        r={'case':name,'command':argv,'exit_code':code,'timeout':timed_out,'seconds':round(time.monotonic()-start,1),'log':str(dest/(name+'.log'))}
        results.append(r)
        (dest/'summary.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
        print('PASS' if code==0 else 'FAIL',name,r['seconds'],'s',r['log'],flush=True)
        if code:
            # Expose the failure in live CI output; keep the full trace alongside the screenshots.
            lines=(dest/(name+'.log')).read_text(errors='replace').splitlines()
            print('\n'.join(lines[-60:]),flush=True)
    return int(any(r['exit_code']!=0 for r in results))

if __name__=='__main__':sys.exit(main())
