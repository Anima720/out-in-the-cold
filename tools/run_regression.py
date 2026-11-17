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
    'lean': ['test_lean.py'],
}

def process_snapshot():
    """Linux PID identity includes start time, so reused PIDs never become cleanup targets."""
    found={}
    for p in pathlib.Path('/proc').iterdir():
        if not p.name.isdigit(): continue
        try:
            fields=(p/'stat').read_text().rsplit(')',1)[1].split()
            found[int(p.name)]=(int(fields[1]),fields[19],fields[0])
        except (OSError,ValueError,IndexError): pass
    return found

def remember_children(owned):
    state=process_snapshot()
    live={pid for pid,start in owned.items() if pid in state and state[pid][1]==start and state[pid][2]!='Z'}
    while True:
        children={pid for pid,(parent,start,status) in state.items() if parent in live and pid not in live and status!='Z'}
        if not children: break
        for pid in children: owned[pid]=state[pid][1]
        live.update(children)
    return live

def signal_owned(owned, pids, sig):
    sent=0
    for pid in pids:
        # Pin the process before checking its identity; signal the pidfd, not a potentially reused PID.
        try:
            fd=os.pidfd_open(pid)
            try:
                state=process_snapshot().get(pid)
                if state and state[1]==owned[pid] and state[2]!='Z':
                    signal.pidfd_send_signal(fd,sig);sent+=1
            finally: os.close(fd)
        except ProcessLookupError: pass
    return sent

def wait_case(proc, seconds, owned):
    deadline=time.monotonic()+seconds
    while True:
        remember_children(owned)
        if proc.poll() is not None: return False
        left=deadline-time.monotonic()
        if left<=0: return True
        try: proc.wait(timeout=min(.5,left))
        except subprocess.TimeoutExpired: pass

def cleanup_case(proc, owned, grace=3):
    # Playwright launches Chrome in a separate process group. Remembered descendants remain
    # ours after reparenting; unrelated browsers/process groups are never signalled.
    live=remember_children(owned);terms=signal_owned(owned,live,signal.SIGTERM);sent=set(live)
    until=time.monotonic()+grace
    while live and time.monotonic()<until:
        time.sleep(.1);proc.poll();live=remember_children(owned)
        terms+=signal_owned(owned,live-sent,signal.SIGTERM);sent.update(live)
    kills=signal_owned(owned,live,signal.SIGKILL)
    until=time.monotonic()+2
    while live and time.monotonic()<until:
        time.sleep(.05);proc.poll();live=remember_children(owned)
    return {'term':terms,'kill':kills,'remaining':sorted(live)}

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('cases', nargs='*', choices=None)
    ap.add_argument('--timeout', type=int, default=900)
    args=ap.parse_args()
    names=args.cases or list(CASES)
    unknown=set(names)-set(CASES)
    if unknown: ap.error('Unknown cases: '+', '.join(sorted(unknown)))
    if sys.platform!='linux' or not pathlib.Path('/proc').is_dir() or not hasattr(os,'pidfd_open') or not hasattr(signal,'pidfd_send_signal'):
        ap.error('Safe descendant cleanup requires Linux /proc and Python pidfd support; run this suite on Linux or run the individual checks directly.')
    try:
        fd=os.pidfd_open(os.getpid());os.close(fd)
    except OSError as exc: ap.error('Safe descendant cleanup cannot open a pidfd: '+str(exc))
    dest=ROOT/'shots'/'regression';dest.mkdir(parents=True,exist_ok=True)
    results=[]
    for name in names:
        argv=[sys.executable,'-u',str(ROOT/'tools'/CASES[name][0]),*CASES[name][1:]]
        start=time.monotonic(); timed_out=False
        print('RUN',name,flush=True)
        with (dest/(name+'.log')).open('w') as log:
            proc=subprocess.Popen(argv,cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
            identity=process_snapshot().get(proc.pid);owned={proc.pid:identity[1]} if identity else {}
            try: timed_out=wait_case(proc,args.timeout,owned)
            finally: cleanup=cleanup_case(proc,owned)
            code=proc.poll()
        r={'case':name,'command':argv,'exit_code':code,'timeout':timed_out,'seconds':round(time.monotonic()-start,1),'log':str(dest/(name+'.log')),'cleanup':cleanup}
        results.append(r)
        (dest/'summary.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
        print('PASS' if code==0 and not timed_out and not cleanup['remaining'] else 'FAIL',name,r['seconds'],'s',r['log'],flush=True)
        if cleanup['term'] or cleanup['kill']: print('cleanup',name,cleanup,flush=True)
        if code or timed_out or cleanup['remaining']:
            # Expose the failure in live CI output; keep the full trace alongside the screenshots.
            lines=(dest/(name+'.log')).read_text(errors='replace').splitlines()
            print('\n'.join(lines[-60:]),flush=True)
        if cleanup['remaining']:
            print('STOP: case processes remain alive; do not contaminate the next case',cleanup['remaining'],flush=True)
            return 1
    return int(any(r['exit_code']!=0 or r['timeout'] for r in results))

if __name__=='__main__':sys.exit(main())
