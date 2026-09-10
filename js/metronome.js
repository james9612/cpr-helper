/**
 * NFC 急救拍 - 精簡版 CPR 節拍器引擎 (固定 110 BPM)
 * 自動音訊喚醒、防休眠 (Wake Lock) 與震動反饋
 */

class CprMetronome {
  constructor() {
    this.bpm = 110; // 固定黃金救命頻率 110 BPM
    this.isRunning = false;
    this.audioCtx = null;
    this.lookahead = 25.0; // ms
    this.scheduleAheadTime = 0.1; // s
    this.nextNoteTime = 0.0;
    this.timerId = null;
    this.totalCompressions = 0;
    this.wakeLock = null;

    // 計時器
    this.elapsedSeconds = 0;
    this.elapsedTimerId = null;

    // 回呼
    this.onBeat = null;
    this.onTick = null;
    this.isMuted = false;
  }

  // 初始化並解鎖 AudioContext
  async initAudio() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContext();
    }
    if (this.audioCtx.state === 'suspended') {
      try {
        await this.audioCtx.resume();
      } catch (e) {
        console.warn('AudioContext resume error:', e);
      }
    }
    return this.audioCtx;
  }

  // 播放清脆、高頻穿透度極佳的雙音頻醫療 CPR 按壓提示音 (高頻化與音量最大化)
  playNote(time) {
    if (this.isMuted || !this.audioCtx) return;

    const ctx = this.audioCtx;
    // 確保排程時間有效，永不落後當前時間
    const t = Math.max(time, ctx.currentTime);

    // 主音頻：提升至 1350Hz 三角波 (具備強烈醫療儀器穿透力、高頻清晰、不沉悶)
    const oscMain = ctx.createOscillator();
    oscMain.type = 'triangle';
    oscMain.frequency.setValueAtTime(1350, t);

    // 高頻衝擊音：提升至 3500Hz 正弦波 (清脆俐落金屬感 Click 聲，使手機微型揚聲器輸出響度最大化)
    const oscClick = ctx.createOscillator();
    oscClick.type = 'sine';
    oscClick.frequency.setValueAtTime(3500, t);

    // 高頻音量封包 (最大化數位增益)
    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.7, t);
    clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);

    // 總音量封包 (Attack 3ms 防爆音, 85ms 俐落收音，100% 滿載輸出)
    const mainGain = ctx.createGain();
    mainGain.gain.setValueAtTime(0.001, t);
    mainGain.gain.linearRampToValueAtTime(1.0, t + 0.003);
    mainGain.gain.exponentialRampToValueAtTime(0.001, t + 0.085);

    // 線路連接
    oscClick.connect(clickGain);
    clickGain.connect(mainGain);
    oscMain.connect(mainGain);
    mainGain.connect(ctx.destination);

    // 啟動與終止
    oscMain.start(t);
    oscClick.start(t);
    oscMain.stop(t + 0.09);
    oscClick.stop(t + 0.09);
  }

  nextNote() {
    const secondsPerBeat = 60.0 / this.bpm; // 110 BPM: 約 0.545 秒一拍
    this.nextNoteTime += secondsPerBeat;
    this.totalCompressions++;
  }

  scheduler() {
    if (!this.isRunning || !this.audioCtx) return;

    while (this.nextNoteTime < this.audioCtx.currentTime + this.scheduleAheadTime) {
      const scheduledTime = this.nextNoteTime;
      const count = this.totalCompressions + 1;

      // 排程播放音效
      this.playNote(scheduledTime);

      // 同步視覺與手機震動
      const delayMs = Math.max(0, (scheduledTime - this.audioCtx.currentTime) * 1000);
      setTimeout(() => {
        if (!this.isRunning) return;

        // 觸覺震動 (支援的手機設備)
        if ('vibrate' in navigator) {
          try { navigator.vibrate(35); } catch (e) {}
        }

        // 觸發視覺回呼
        if (typeof this.onBeat === 'function') {
          this.onBeat(count);
        }
      }, delayMs);

      this.nextNote();
    }

    if (this.isRunning) {
      this.timerId = setTimeout(() => this.scheduler(), this.lookahead);
    }
  }

  // 鎖定螢幕常亮
  async requestWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        this.wakeLock = await navigator.wakeLock.request('screen');
      } catch (err) {}
    }
  }

  releaseWakeLock() {
    if (this.wakeLock !== null) {
      this.wakeLock.release().catch(() => {});
      this.wakeLock = null;
    }
  }

  // 啟動節拍器 (零延遲立即發聲)
  async start() {
    if (this.isRunning) return;

    await this.initAudio();
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      try {
        await this.audioCtx.resume();
      } catch (e) {}
    }

    this.isRunning = true;
    this.totalCompressions = 0;

    const now = this.audioCtx ? this.audioCtx.currentTime : 0;

    // 零延遲立即響起第一拍按壓聲
    this.playNote(now);

    // 立即觸發第一下視覺心跳與震動
    if ('vibrate' in navigator) {
      try { navigator.vibrate(40); } catch (e) {}
    }
    if (typeof this.onBeat === 'function') {
      this.onBeat(1);
    }
    this.totalCompressions = 1;

    // 計算下一拍排程
    this.nextNoteTime = now + (60.0 / this.bpm);

    this.requestWakeLock();
    this.startElapsedTimer();
    this.scheduler();
  }

  // 停止 / 暫停
  stop() {
    this.isRunning = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    if (this.elapsedTimerId) {
      clearInterval(this.elapsedTimerId);
      this.elapsedTimerId = null;
    }
    this.releaseWakeLock();
  }

  // 重設
  reset() {
    this.stop();
    this.totalCompressions = 0;
    this.elapsedSeconds = 0;
    if (typeof this.onTick === 'function') this.onTick(0);
  }

  startElapsedTimer() {
    if (this.elapsedTimerId) clearInterval(this.elapsedTimerId);
    this.elapsedTimerId = setInterval(() => {
      this.elapsedSeconds++;
      if (typeof this.onTick === 'function') {
        this.onTick(this.elapsedSeconds);
      }
    }, 1000);
  }
}

window.CprMetronome = CprMetronome;
