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
  // 緊急語音廣播控制器 (自動輪播 2 次) - Web Audio API + HTML5 雙軌架構
  // ==========================================

  let emergencyAudioBuffer = null;
  let currentVoiceSource = null;
  let isDecodingBuffer = false;

  // 預先抓取音訊 ArrayBuffer，加快解碼就緒速度
  fetch('./audio/alert_119_aed.mp3')
    .then(r => r.arrayBuffer())
    .then(buf => {
      window._cachedEmergencyArrayBuffer = buf;
    })
    .catch(() => {});

  async function loadAndDecodeEmergencyAudio() {
    if (emergencyAudioBuffer) return emergencyAudioBuffer;
    if (isDecodingBuffer) {
      let attempts = 0;
      while (isDecodingBuffer && attempts < 20) {
        await new Promise(r => setTimeout(r, 50));
        attempts++;
      }
      return emergencyAudioBuffer;
    }
    isDecodingBuffer = true;
    try {
      const audioCtx = await metronome.initAudio();
      if (!audioCtx) return null;
      let arrayBuf = window._cachedEmergencyArrayBuffer;
      if (!arrayBuf) {
        const res = await fetch('./audio/alert_119_aed.mp3');
        arrayBuf = await res.arrayBuffer();
        window._cachedEmergencyArrayBuffer = arrayBuf;
      }
      // decodeAudioData 在各瀏覽器中完美相容 Promise 與 Callback
      emergencyAudioBuffer = await new Promise((resolve, reject) => {
        try {
          const promise = audioCtx.decodeAudioData(arrayBuf.slice(0), resolve, reject);
          if (promise && typeof promise.then === 'function') {
            promise.then(resolve).catch(reject);
          }
        } catch (e) {
          reject(e);
        }
      });
      return emergencyAudioBuffer;
    } catch (e) {
      console.warn('Web Audio 解碼備援:', e);
      return null;
    } finally {
      isDecodingBuffer = false;
    }
  }

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

  // 軌道 1: Web Audio API 原生緩衝發聲 (無 Range 請求問題、無 Android MediaPlayer 焦點衝突、零延遲)
  function playAudioBufferClip() {
    return new Promise(async (resolve, reject) => {
      try {
        const audioCtx = await metronome.initAudio();
        if (!audioCtx) return reject(new Error('AudioContext 不可用'));
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }

        let buffer = emergencyAudioBuffer;
        if (!buffer) {
          buffer = await loadAndDecodeEmergencyAudio();
        }
        if (!buffer) {
          return reject(new Error('無法載入 AudioBuffer'));
        }

        const source = audioCtx.createBufferSource();
        source.buffer = buffer;

        const gainNode = audioCtx.createGain();
        gainNode.gain.value = metronome.isMuted ? 0 : 1.0;

        source.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        let settled = false;
        source.onended = () => {
          if (!settled) {
            settled = true;
            if (currentVoiceSource === source) currentVoiceSource = null;
            resolve();
          }
        };

        currentVoiceSource = source;
        source.start(0);

        // 防禦性安全超時
        setTimeout(() => {
          if (!settled) {
            settled = true;
            if (currentVoiceSource === source) currentVoiceSource = null;
            resolve();
          }
        }, Math.ceil(buffer.duration * 1000) + 300);
      } catch (err) {
        reject(err);
      }
    });
  }

  // 軌道 2: HTML5 Audio 標籤播放 Promise
  function playHtml5AudioClip() {
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

      let settled = false;
      const onEnd = () => {
        if (!settled) {
          settled = true;
          emergencyAudio.removeEventListener('ended', onEnd);
          emergencyAudio.removeEventListener('error', onErr);
          resolve();
        }
      };
      const onErr = (e) => {
        if (!settled) {
          settled = true;
          emergencyAudio.removeEventListener('ended', onEnd);
          emergencyAudio.removeEventListener('error', onErr);
          reject(e);
        }
      };

      emergencyAudio.addEventListener('ended', onEnd);
      emergencyAudio.addEventListener('error', onErr);

      const playPromise = emergencyAudio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          if (!settled) {
            settled = true;
            emergencyAudio.removeEventListener('ended', onEnd);
            emergencyAudio.removeEventListener('error', onErr);
            reject(err);
          }
        });
      }

      // 防禦性超時防卡住
      setTimeout(() => {
        if (!settled) {
          settled = true;
          emergencyAudio.removeEventListener('ended', onEnd);
          emergencyAudio.removeEventListener('error', onErr);
          resolve();
        }
      }, 4500);
    });
  }

  // 單次播放音訊 Promise (雙軌自動回退：Web Audio -> HTML5 Audio)
  async function playSingleAudioClip() {
    try {
      await playAudioBufferClip();
      return;
    } catch (e) {
      console.warn('Web Audio 播放失敗，回退至 HTML5 Audio:', e);
    }
    await playHtml5AudioClip();
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
    // 若節拍器已在運行中，絕不搶播語音
    if (metronome.isRunning) return;
    isSpeaking = true;

    try {
      for (let i = 1; i <= 2; i++) {
        // 若已靜音或節拍器被手動啟動，立刻中斷廣播
        if (metronome.isMuted || metronome.isRunning) break;

        setVoiceUIState(true, `語音廣播中 (${i}/2)`);

        await playSingleAudioClip();

        // 播畢後再次確認節拍器是否在播放期間被啟動
        if (metronome.isRunning) break;

        // 第 1 次播完後停頓 0.6 秒再播第 2 次
        if (i === 1 && !metronome.isMuted && !metronome.isRunning) {
          await new Promise(r => setTimeout(r, 600));
        }
      }

      if (!metronome.isRunning) {
        hasCompletedAlert = true;
        setVoiceUIState(false, '播報完畢');
      }
    } catch (err) {
      setVoiceUIState(false, '語音待命中');
      throw err;
    } finally {
      isSpeaking = false;
    }
  }

  // iOS 靜音模式破除器 (透過 playsinline audio 觸發 Playback Session)
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const silentUnlockAudio = document.createElement('audio');
  silentUnlockAudio.setAttribute('playsinline', '');
  silentUnlockAudio.setAttribute('webkit-playsinline', '');
  silentUnlockAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

  function unlockAudioEngine() {
    // 僅在 iOS 上啟用 silentUnlockAudio 以破除實體靜音開關
    // Android 上切勿執行，避免 Android MediaPlayer 焦點搶奪導致主語音被消音
    if (isIOS) {
      try {
        silentUnlockAudio.play().catch(() => {});
      } catch (e) {}
    }
    try {
      metronome.initAudio().catch(() => {});
    } catch (e) {}
  }

  // ==========================================
  // 一觸即響全螢幕急救啟動門 (Tap-to-Start Emergency Gate)
  // 使用者碰觸螢幕任何位置，立即以最高權限手勢啟動語音並解除遮罩
  // ==========================================
  const tapOverlay = document.getElementById('tap-overlay');
  let isOverlayDismissed = false;
  let overlayDismissedAt = 0; // 記錄遮罩解除時間戳，用於冷卻時間防穿透

  function dismissTapOverlayAndStart(e) {
    if (isOverlayDismissed) return;
    isOverlayDismissed = true;
    overlayDismissedAt = Date.now();

    // 解除遮罩後，解綁全局手勢監聽
    removeActivationListeners();

    // 1. 同步毫秒級解鎖 Web Audio & HTML5 Audio (在合法 User Activation 呼叫棧內)
    unlockAudioEngine();

    // 2. 立即以本次合法手勢直通發聲（100% 符合 iOS & Android 手勢規範）
    playEmergencyBroadcastTwice().catch(() => {
      speakFallbackTTS().catch(() => {});
    });

    // 3. 遮罩平滑微縮淡出
    if (tapOverlay) {
      tapOverlay.classList.add('fade-out');
      setTimeout(() => {
        tapOverlay.style.display = 'none';
      }, 260);
    }
  }

  // 僅綁定合法的 User Activation 事件：click, touchend, keydown
  // 嚴禁使用 touchstart 或 pointerdown，因為 Android Chrome 政策認定 touchstart 不屬於使用者授權手勢，呼叫 play() 會直接被阻擋
  const activationEvents = ['click', 'touchend', 'keydown'];

  function handleActivationInteraction(e) {
    if (!isOverlayDismissed) {
      dismissTapOverlayAndStart(e);
      return;
    }
    if (!hasCompletedAlert && !isSpeaking && !metronome.isRunning) {
      unlockAudioEngine();
      playEmergencyBroadcastTwice().catch(() => {
        speakFallbackTTS().catch(() => {});
      });
    }
  }

  function removeActivationListeners() {
    activationEvents.forEach(evt => {
      window.removeEventListener(evt, handleActivationInteraction);
    });
  }

  if (tapOverlay) {
    tapOverlay.addEventListener('click', dismissTapOverlayAndStart);
    tapOverlay.addEventListener('touchend', dismissTapOverlayAndStart);

    // 若在已授權環境中早已自動出聲，遮罩自動在 300ms 內平滑退場
    setTimeout(() => {
      if ((emergencyAudio && !emergencyAudio.paused && emergencyAudio.currentTime > 0) || isSpeaking) {
        dismissTapOverlayAndStart();
      }
    }, 300);
  }

  activationEvents.forEach(evt => {
    window.addEventListener(evt, handleActivationInteraction);
  });

  // 強制停止急救廣播語音（當施救者手動啟動 CPR 節拍器時）
  function stopEmergencyBroadcast() {
    if (currentVoiceSource) {
      try {
        currentVoiceSource.stop(0);
        currentVoiceSource.disconnect();
      } catch (e) {}
      currentVoiceSource = null;
    }
    if (emergencyAudio) {
      try {
        emergencyAudio.pause();
        emergencyAudio.currentTime = 0;
      } catch (e) {}
    }
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }
    isSpeaking = false;
    hasCompletedAlert = true;
    setVoiceUIState(false, '已切換至 CPR 按壓');
  }

  // 點擊「重播急救語音」
  if (replayVoiceBtn) {
    replayVoiceBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      unlockAudioEngine();
      // 若節拍器正在運作，先暫停節拍器，讓語音清晰傳達
      if (metronome.isRunning) {
        metronome.stop();
        updatePlayPauseUI(false);
      }
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
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
    }

    // 防穿透點擊與誤觸保護：若距離關閉第一畫面遮罩不到 800ms，徹底忽略本次點擊
    if (Date.now() - overlayDismissedAt < 800) {
      return;
    }

    unlockAudioEngine();

    if (metronome.isRunning) {
      metronome.stop();
      updatePlayPauseUI(false);
    } else {
      // 啟動節拍器時，若急救廣播語音仍在播放，立即強制停止語音，確保節拍音頻清晰無干擾
      stopEmergencyBroadcast();
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

