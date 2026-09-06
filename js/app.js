/**
 * NFC 急救拍 - 極速自動啟動邏輯 (固定 110 BPM，感應即響)
 */

document.addEventListener('DOMContentLoaded', () => {
  const metronome = new CprMetronome();

  // DOM 元素
  const tapOverlay = document.getElementById('tap-to-start-overlay');
  const pulseVisualizer = document.getElementById('pulse-visualizer');
  const toggleBtn = document.getElementById('toggle-btn');
  const toggleText = document.getElementById('toggle-text');
  const iconPause = document.getElementById('icon-pause');
  const iconPlay = document.getElementById('icon-play');
  const resetBtn = document.getElementById('reset-btn');
  const compressionCountElem = document.getElementById('compression-count');
  const timerDisplayElem = document.getElementById('timer-display');
  const muteBtn = document.getElementById('mute-toggle-btn');
  const soundIconOn = document.getElementById('sound-icon-on');
  const soundIconOff = document.getElementById('sound-icon-off');
  const wakeStatus = document.getElementById('wake-status');

  // 格式化計時 MM:SS
  function formatTime(totalSec) {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // 節拍視覺動畫
  metronome.onBeat = (count) => {
    pulseVisualizer.classList.add('beating');
    setTimeout(() => {
      pulseVisualizer.classList.remove('beating');
    }, 85);

    if (compressionCountElem) {
      compressionCountElem.textContent = count;
    }
  };

  // 時間推進
  metronome.onTick = (elapsedSec) => {
    if (timerDisplayElem) {
      timerDisplayElem.textContent = formatTime(elapsedSec);
    }
  };

  // 更新播放 / 暫停狀態 UI (移除 110BPM 數字，統一為「開始節拍」與「暫停節拍」)
  function updatePlayPauseUI(isRunning) {
    if (isRunning) {
      toggleBtn.classList.remove('ready-start');
      toggleBtn.classList.add('running');
      toggleText.textContent = '暫停節拍';
      iconPause.classList.remove('hidden');
      iconPlay.classList.add('hidden');
      if (wakeStatus) wakeStatus.classList.remove('hidden');
    } else {
      toggleBtn.classList.remove('running');
      toggleBtn.classList.add('ready-start');
      toggleText.textContent = '開始節拍';
      iconPause.classList.add('hidden');
      iconPlay.classList.remove('hidden');
      if (wakeStatus) wakeStatus.classList.add('hidden');
    }
  }

  // iOS 靜音模式破除器 (透過 playsinline audio 觸發 Playback Session)
  const silentUnlockAudio = document.createElement('audio');
  silentUnlockAudio.setAttribute('playsinline', '');
  silentUnlockAudio.setAttribute('webkit-playsinline', '');
  silentUnlockAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

  function unlockAudioEngine() {
    silentUnlockAudio.play().catch(() => {});
    metronome.initAudio().catch(() => {});
  }

  // 任意觸碰預熱音訊引擎 (僅解鎖，不搶奪按鈕控制權)
  ['touchstart', 'touchend', 'mousedown', 'keydown'].forEach(evt => {
    document.addEventListener(evt, unlockAudioEngine, { once: true, passive: true });
  });

  // 統一播放 / 暫停控制
  async function toggleMetronomeState(e) {
    if (e) {
      e.stopPropagation();
    }
    unlockAudioEngine();

    if (metronome.isRunning) {
      metronome.stop();
      updatePlayPauseUI(false);
    } else {
      await metronome.start();
      updatePlayPauseUI(true);
    }
  }

  // 暫停 / 開始按鈕
  toggleBtn.addEventListener('click', toggleMetronomeState);

  // 點擊心臟大圓盤亦可開始/暫停
  const heartDisc = document.getElementById('heart-disc');
  if (heartDisc) {
    heartDisc.addEventListener('click', toggleMetronomeState);
  }

  // 初始介面狀態：預備開始
  updatePlayPauseUI(false);


  // 重設數據 (若存在)
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      metronome.reset();
      updatePlayPauseUI(false);
      if (compressionCountElem) compressionCountElem.textContent = '0';
      if (timerDisplayElem) timerDisplayElem.textContent = '00:00';
    });
  }

  // 靜音切換
  muteBtn.addEventListener('click', () => {
    metronome.isMuted = !metronome.isMuted;
    if (metronome.isMuted) {
      soundIconOn.classList.add('hidden');
      soundIconOff.classList.remove('hidden');
    } else {
      soundIconOn.classList.remove('hidden');
      soundIconOff.classList.add('hidden');
      metronome.initAudio();
    }
  });
});
