/**
 * NFC 急救拍 - 極速自動啟動邏輯 (固定 110 BPM)
 * 感應即播：自動播放 2 次急救語音廣播 (撥打 119 與協助拿取 AED)
 * 節拍器保持手動啟動 (方便施救者先通話報案)，音量 100% 滿載輸出
 */

document.addEventListener('DOMContentLoaded', () => {
  const metronome = new CprMetronome();

  // DOM 元素
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
  if (emergencyAudio) {
    emergencyAudio.volume = 1.0; // 確保音訊為 100% 滿載音量
  }
  const voiceStatusPill = document.getElementById('voice-broadcast-status');
  const voiceStatusText = document.getElementById('voice-status-text');
  const replayVoiceBtn = document.getElementById('btn-replay-voice');
  const replayBtnLabel = document.getElementById('replay-btn-label');

  let hasCompletedAlert = false;
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

  // 更新播放 / 暫停狀態 UI (節拍器保持手動啟動)
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
  // 緊急語音廣播控制器 (自動輪播 2 次)
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

  // 單次播放音訊 Promise
  function playSingleAudioClip() {
    return new Promise((resolve, reject) => {
      if (!emergencyAudio) {
        return resolve();
      }
      try {
        if (emergencyAudio.readyState > 0) {
          emergencyAudio.currentTime = 0;
        }
      } catch (e) {}
      emergencyAudio.volume = 1.0;
      emergencyAudio.muted = metronome.isMuted;

      const onEnd = () => {
        emergencyAudio.removeEventListener('ended', onEnd);
        emergencyAudio.removeEventListener('error', onErr);
        resolve();
      };
      const onErr = (e) => {
        emergencyAudio.removeEventListener('ended', onEnd);
        emergencyAudio.removeEventListener('error', onErr);
        resolve(); // 出錯時安全退出
      };

      emergencyAudio.addEventListener('ended', onEnd);
      emergencyAudio.addEventListener('error', onErr);

      const playPromise = emergencyAudio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          emergencyAudio.removeEventListener('ended', onEnd);
          emergencyAudio.removeEventListener('error', onErr);
          reject(err);
        });
      }
    });
  }

  // Web Speech API 離線備援朗讀
  function speakFallbackTTS() {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) {
        return resolve();
      }
      try {
        window.speechSynthesis.cancel();
        const text = '意外狀況，請立即撥打 119 求救，並請旁人協助拿取 AED！';
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-TW';
        utterance.rate = 1.05;
        utterance.pitch = 1.0;

        const voices = window.speechSynthesis.getVoices();
        const twVoice = voices.find(v => v.lang === 'zh-TW' || v.lang === 'zh_TW' || v.name.includes('Taiwan') || v.name.includes('Traditional'));
        if (twVoice) {
          utterance.voice = twVoice;
        }

        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        resolve();
      }
    });
  }

  // 播放急救語音 (連續播報 2 次)
  async function playEmergencyBroadcastTwice() {
    if (isSpeaking) return;
    isSpeaking = true;

    try {
      for (let i = 1; i <= 2; i++) {
        if (metronome.isMuted) break;

        setVoiceUIState(true, `語音廣播中 (${i}/2)`);

        // 若第 1 次且已由 HTML5 autoplay 成功直接發聲，接續等待其自然播畢
        if (i === 1 && !emergencyAudio.paused && emergencyAudio.currentTime > 0 && !emergencyAudio.ended) {
          await new Promise((resolve) => {
            const onEnd = () => {
              emergencyAudio.removeEventListener('ended', onEnd);
              resolve();
            };
            emergencyAudio.addEventListener('ended', onEnd, { once: true });
          });
        } else {
          await playSingleAudioClip();
        }

        // 第 1 次播完後停頓 0.6 秒再播第 2 次
        if (i === 1 && !metronome.isMuted) {
          await new Promise(r => setTimeout(r, 600));
        }
      }

      hasCompletedAlert = true;
      setVoiceUIState(false, '播報完畢');
    } catch (err) {
      setVoiceUIState(false, '語音待命中');
      throw err;
    } finally {
      isSpeaking = false;
    }
  }

  // iOS 靜音模式破除器 (透過 playsinline audio 觸發 Playback Session)
  const silentUnlockAudio = document.createElement('audio');
  silentUnlockAudio.setAttribute('playsinline', '');
  silentUnlockAudio.setAttribute('webkit-playsinline', '');
  silentUnlockAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

  function unlockAudioEngine() {
    try {
      silentUnlockAudio.play().catch(() => {});
    } catch (e) {}
    try {
      metronome.initAudio().catch(() => {});
    } catch (e) {}
  }

  // 任意觸碰全局監聽：若瀏覽器因政策強行阻擋無互動音訊，手指碰觸畫面任何像素時立刻無縫補播
  function handleAnyTouchInteraction() {
    unlockAudioEngine();
    if (!hasCompletedAlert && !isSpeaking) {
      playEmergencyBroadcastTwice().catch(() => {
        speakFallbackTTS().catch(() => {});
      });
    }
  }

  ['touchstart', 'touchend', 'pointerdown', 'mousedown', 'keydown'].forEach(evt => {
    window.addEventListener(evt, handleAnyTouchInteraction, { passive: true });
  });

  // 點擊「重播急救語音」
  if (replayVoiceBtn) {
    replayVoiceBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      unlockAudioEngine();
      try {
        await playEmergencyBroadcastTwice();
      } catch (err) {
        speakFallbackTTS();
      }
    });
  }

  // 統一節拍器播放 / 暫停控制 (保持純手動開啟，絕不自動搶跑)
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

  // 暫停 / 開始按鈕 (手動點擊觸發)
  toggleBtn.addEventListener('click', toggleMetronomeState);

  // 點擊心臟大圓盤亦可手動開始/暫停
  const heartDisc = document.getElementById('heart-disc');
  if (heartDisc) {
    heartDisc.addEventListener('click', toggleMetronomeState);
  }

  // 初始介面狀態：預備開始 (節拍器維持靜止，方便通話)
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
  // 頁面載入瞬間：零延遲直接嘗試自動播放急救語音 (無等待、無遮罩)
  // ==========================================
  function triggerImmediateBroadcast() {
    if (hasCompletedAlert || isSpeaking) return;
    unlockAudioEngine();
    playEmergencyBroadcastTwice().catch(() => {
      // 若受嚴格瀏覽器政策暫時限制，靜默維持待命狀態，於使用者任意碰觸時立刻補播
    });
  }

  // 1. 同步立即觸發（不加 setTimeout，避免丟失使用者喚醒手勢）
  triggerImmediateBroadcast();

  // 2. window 載入完成時若尚未播報再次嘗試
  window.addEventListener('load', () => {
    if (!hasCompletedAlert && !isSpeaking) {
      triggerImmediateBroadcast();
    }
  });

  // 3. 頁面可見度切換（如從外部 NFC 應用跳轉喚起）
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !hasCompletedAlert && !isSpeaking) {
      triggerImmediateBroadcast();
    }
  });
});

