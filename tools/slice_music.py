import subprocess, numpy as np, sys
SR=44100
def load(f):
    raw = subprocess.run(["ffmpeg","-v","error","-i",f,"-ac","2","-ar",str(SR),"-f","s16le","-"],capture_output=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32).reshape(-1,2)/32768
def save(a, out):
    a = np.clip(a, -1, 1); pcm = (a*32767).astype(np.int16).tobytes()
    subprocess.run(["ffmpeg","-v","error","-y","-f","s16le","-ar",str(SR),"-ac","2","-i","-","-b:a","128k",out], input=pcm, check=True)
def loop(a, s, e, xf=1.5):
    seg = a[int(s*SR):int(e*SR)].copy(); n=int(xf*SR)
    head, tail = seg[:n], seg[-n:]
    t = np.linspace(0,1,n)[:,None]
    mix = tail*np.cos(t*np.pi/2) + head*np.sin(t*np.pi/2)
    return np.concatenate([mix, seg[n:-n]])
def once(a, s, e, fin=1.0, fout=3.0):
    seg = a[int(s*SR):int(e*SR)].copy()
    ni, no = int(fin*SR), int(fout*SR)
    seg[:ni] *= np.linspace(0,1,ni)[:,None]; seg[-no:] *= np.linspace(1,0,no)[:,None]
    return seg
TR = load(sys.argv[1] if len(sys.argv) > 1 else "Before_The_Last_Trench.mp3")
TD = load(sys.argv[2] if len(sys.argv) > 2 else "Under_the_Iron_Tread.mp3")
D=str(__import__("pathlib").Path(__file__).resolve().parent.parent / "assets" / "music") + "/"
save(loop(TR, 0.0, 24.0), D+"M5_AWAKE.mp3")
save(loop(TR, 44.0, 100.0), D+"M5_DEFEND.mp3")
save(loop(TD, 0.5, 56.0), D+"M5_JUGG.mp3")
save(once(TR, 140.0, 166.0, 1.5, 4.0), D+"M5_LOSS.mp3")
save(loop(TR, 108.0, 140.0), D+"M5_FINAL.mp3")
save(loop(TR, 24.0, 44.0), D+"M1_BUILD.mp3")
print("ok")
