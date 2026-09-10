/**
 * NFC 急救拍 - 極速自動啟動邏輯 (固定 110 BPM，感應即響)
 * 包含 NFC 掃描後語音廣播提醒 (撥打 119 與協助拿取 AED)
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

  // 緊急語音廣播 DOM
  const emergencyAudio = document.getElementById('emergency-audio');
  const voiceStatusPill = document.getElementById('voice-broadcast-status');
  const voiceStatusText = document.getElementById('voice-status-text');
  const replayVoiceBtn = document.getElementById('btn-replay-voice');
  const replayBtnLabel = document.getElementById('replay-btn-label');

  let hasSpokenAlert = false;
  let isSpeaking = false;

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

  // 更新播放 / 暫停狀態 UI
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

  // ==========================================
  // 緊急語音廣播控制器 (119 求救 & 拿取 AED)
  // ==========================================

  function setVoiceUIState(speaking, text) {
    isSpeaking = speaking;
    if (voiceStatusPill) {
      if (speaking) {
        voiceStatusPill.classList.remove('idle');
        voiceStatusPill.classList.add('playing');
      } else {
        voiceStatusPill.classList.remove('playing');
        voiceStatusPill.classList.add('idle');
      }
    }
    if (voiceStatusText) {
      voiceStatusText.textContent = text || (speaking ? '語音播報中' : '播報完畢');
    }
    if (replayVoiceBtn) {
      if (speaking) {
        replayVoiceBtn.classList.add('active-playing');
      } else {
        replayVoiceBtn.classList.remove('active-playing');
      }
    }
    if (replayBtnLabel) {
      replayBtnLabel.textContent = speaking ? '正在播報...' : '重播語音';
    }
  }

  // Web Speech API 離線備援朗讀
  function speakFallbackTTS() {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) {
        setVoiceUIState(false, '完成');
        resolve();
        return;
      }
      try {
        window.speechSynthesis.cancel();
        const text = '意外狀況，請立即撥打 119 求救，並請旁人協助拿取 AED！';
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-TW';
        utterance.rate = 1.05;
        utterance.pitch = 1.0;

        // 優先搜尋台灣中文 (zh-TW) 語音
        const voices = window.speechSynthesis.getVoices();
        const twVoice = voices.find(v => v.lang === 'zh-TW' || v.lang === 'zh_TW' || v.name.includes('Taiwan') || v.name.includes('Traditional'));
        if (twVoice) {
          utterance.voice = twVoice;
        }

        utterance.onstart = () => {
          setVoiceUIState(true, '語音廣播中');
        };

        utterance.onend = () => {
          setVoiceUIState(false, '播報完畢');
          resolve();
        };

        utterance.onerror = () => {
          setVoiceUIState(false, '完成');
          resolve();
        };

        window.speechSynthesis.speak(utterance);
      } catch (e) {
        setVoiceUIState(false, '完成');
        resolve();
      }
    });
  }

  // 播放急救語音廣播主程式
  async function playEmergencyBroadcast() {
    setVoiceUIState(true, '語音廣播中');

    if (emergencyAudio) {
      try {
        emergencyAudio.currentTime = 0;
        emergencyAudio.muted = metronome.isMuted;
        await emergencyAudio.play();
        hasSpokenAlert = true;

        return new Promise((resolve) => {
          emergencyAudio.onended = () => {
            setVoiceUIState(false, '播報完畢');
            resolve();
          };
          emergencyAudio.onerror = async () => {
            // 音訊檔異常時退回原生 TTS
            await speakFallbackTTS();
            resolve();
          };
        });
      } catch (err) {
        // 若被瀏覽器 Autoplay 阻擋 (NotAllowedError)，由調用者處理遮罩
        setVoiceUIState(false, '輕觸播放');
        throw err;
      }
    } else {
      return speakFallbackTTS();
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
    if (tapOverlay && !tapOverlay.classList.contains('hidden')) {
      tapOverlay.classList.add('hidden');
    }
  }

  // 使用者初次任意互動時觸發解鎖與語音補償
  async function handleFirstUserInteraction() {
    unlockAudioEngine();
    if (!hasSpokenAlert) {
      try {
        await playEmergencyBroadcast();
      } catch (e) {
        speakFallbackTTS().catch(() => {});
      }
    }
  }

  // 任意觸碰預熱音訊引擎 (僅在未廣播前接管首次觸碰)
  ['touchstart', 'touchend', 'mousedown', 'keydown'].forEach(evt => {
    document.addEventListener(evt, () => {
      handleFirstUserInteraction();
    }, { once: true, passive: true });
  });

  // 點擊「一觸即響遮罩」立即播放
  if (tapOverlay) {
    tapOverlay.addEventListener('click', (e) => {
      e.stopPropagation();
      tapOverlay.classList.add('hidden');
      handleFirstUserInteraction();
    });
  }

  // 點擊「重播急救語音」
  if (replayVoiceBtn) {
    replayVoiceBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      unlockAudioEngine();
      try {
        await playEmergencyBroadcast();
      } catch (err) {
        speakFallbackTTS();
      }
    });
  }

  // 統一節拍器播放 / 暫停控制
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
    if (emergencyAudio) {
      emergencyAudio.muted = metronome.isMuted;
    }
    if (metronome.isMuted) {
      soundIconOn.classList.add('hidden');
      soundIconOff.classList.remove('hidden');
    } else {
      soundIconOn.classList.remove('hidden');
      soundIconOff.classList.add('hidden');
      metronome.initAudio();
    }
  });

  // ==========================================
  // 頁面載入瞬間：嘗試立即自動播放急救語音
  // ==========================================
  setTimeout(() => {
    playEmergencyBroadcast()
      .then(() => {
        // 自動播放成功（如 Android Chrome / PWA 模式），隱藏遮罩
        if (tapOverlay) {
          tapOverlay.classList.add('hidden');
        }
      })
      .catch(() => {
        // 被瀏覽器 Autoplay 阻擋（如 iOS Safari 未觸碰），顯示輕觸引導遮罩
        if (tapOverlay && !hasSpokenAlert) {
          tapOverlay.classList.remove('hidden');
        }
      });
  }, 120);
});

