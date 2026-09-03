const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.reveal').forEach((element, index) => {
  element.style.transitionDelay = `${Math.min(index % 4, 3) * 70}ms`;
  observer.observe(element);
});

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener('click', (event) => {
    const target = document.querySelector(link.getAttribute('href'));
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

const heroVideo = document.querySelector('.video-wrap video');
const videoWrap = document.querySelector('.video-wrap');
const videoPlay = document.querySelector('.video-play');
const videoTime = document.querySelector('.video-time');
const videoProgress = document.querySelector('.video-progress');
const videoProgressFill = document.querySelector('.video-progress span');
const videoFullscreen = document.querySelector('.video-fullscreen');

const progressKey = 'aprova-mais-ifrn-video-progress';
const playingKey = 'aprova-mais-ifrn-video-playing';
const returnKey = 'aprova-mais-ifrn-video-return';
const videoStorage = {
  get(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch { /* local files may block storage */ }
  }
};

let lastAllowedTime = Number(videoStorage.get(progressKey)) || 0;
let wasPlayingWhenLeaving = videoStorage.get(playingKey) === 'true';
let returnPending = videoStorage.get(returnKey) === 'true';
let isInternalSeek = false;
let isRestoringVideo = false;
let initialPositionRestored = false;

function formatVideoTime(seconds) {
  if (!Number.isFinite(seconds)) return '0:00';
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function updateVideoControls() {
  if (!heroVideo) return;
  const duration = heroVideo.duration || 0;
  const percentage = duration ? (heroVideo.currentTime / duration) * 100 : 0;
  videoProgressFill.style.width = `${percentage}%`;
  videoProgress.setAttribute('aria-valuenow', String(Math.round(percentage)));
  videoTime.textContent = `${formatVideoTime(heroVideo.currentTime)} / ${formatVideoTime(duration)}`;
  videoPlay.textContent = heroVideo.paused ? '▶' : 'Ⅱ';
  videoPlay.setAttribute('aria-label', heroVideo.paused ? 'Reproduzir vídeo' : 'Pausar vídeo');
}

function saveVideoState(playing = !heroVideo.paused && !heroVideo.ended) {
  lastAllowedTime = heroVideo.currentTime;
  wasPlayingWhenLeaving = playing;
  videoStorage.set(progressKey, String(lastAllowedTime));
  videoStorage.set(playingKey, String(wasPlayingWhenLeaving));
}

function seekInternally(time, done) {
  const duration = heroVideo.duration || time;
  const target = Math.min(Math.max(0, time), Math.max(0, duration - 0.05));
  isInternalSeek = true;

  const finish = () => {
    lastAllowedTime = target;
    videoStorage.set(progressKey, String(target));
    isInternalSeek = false;
    updateVideoControls();
    done?.();
  };

  if (Math.abs(heroVideo.currentTime - target) < 0.05) {
    finish();
    return;
  }

  heroVideo.addEventListener('seeked', finish, { once: true });
  heroVideo.currentTime = target;
}

function pauseVideoWhenLeaving() {
  if (!heroVideo) return;
  if (!videoWrap.classList.contains('is-backgrounded')) {
    saveVideoState(!heroVideo.paused && !heroVideo.ended);
  }
  heroVideo.pause();
  videoStorage.set(playingKey, String(wasPlayingWhenLeaving));
  videoStorage.set(returnKey, 'true');
  returnPending = true;
  videoWrap.classList.add('is-backgrounded');
}

function finishRestore(resumePlayback) {
  const reveal = () => {
    videoWrap.classList.remove('is-backgrounded');
    isRestoringVideo = false;
    returnPending = false;
    videoStorage.set(returnKey, 'false');
  };

  const revealAfterRenderedFrame = () => {
    if ('requestVideoFrameCallback' in heroVideo) {
      heroVideo.requestVideoFrameCallback(() => reveal());
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(reveal));
  };

  if (!resumePlayback) {
    reveal();
    return;
  }

  heroVideo.addEventListener('playing', revealAfterRenderedFrame, { once: true });
  heroVideo.play().catch(reveal);
}

function restoreVideoFrame() {
  if (!heroVideo || document.hidden || isRestoringVideo) return;
  if (!videoWrap.classList.contains('is-backgrounded')) return;

  isRestoringVideo = true;
  const savedTime = Number(videoStorage.get(progressKey)) || lastAllowedTime;
  const resumePlayback = wasPlayingWhenLeaving || videoStorage.get(playingKey) === 'true';

  const restoreAfterReload = () => {
    seekInternally(savedTime, () => finishRestore(resumePlayback));
  };

  heroVideo.addEventListener('loadedmetadata', restoreAfterReload, { once: true });
  heroVideo.load();
}

if (heroVideo) {
  if (returnPending) videoWrap.classList.add('is-backgrounded');

  heroVideo.addEventListener('loadedmetadata', () => {
    heroVideo.playbackRate = 1;
    updateVideoControls();

    if (initialPositionRestored || isRestoringVideo) return;
    initialPositionRestored = true;
    if (!lastAllowedTime) return;
    if (returnPending) isRestoringVideo = true;

    seekInternally(lastAllowedTime, () => {
      if (returnPending) finishRestore(wasPlayingWhenLeaving);
    });
  });

  heroVideo.addEventListener('timeupdate', () => {
    if (!isInternalSeek && !isRestoringVideo && !heroVideo.seeking) {
      lastAllowedTime = heroVideo.currentTime;
      videoStorage.set(progressKey, String(lastAllowedTime));
    }
    updateVideoControls();
  });

  heroVideo.addEventListener('ratechange', () => {
    if (heroVideo.playbackRate !== 1) heroVideo.playbackRate = 1;
  });

  heroVideo.addEventListener('seeking', () => {
    if (isInternalSeek || isRestoringVideo) return;
    if (Math.abs(heroVideo.currentTime - lastAllowedTime) <= 0.25) return;

    isInternalSeek = true;
    heroVideo.addEventListener('seeked', () => {
      isInternalSeek = false;
      updateVideoControls();
    }, { once: true });
    heroVideo.currentTime = lastAllowedTime;
  });

  heroVideo.addEventListener('play', () => {
    if (!isRestoringVideo) videoWrap.classList.remove('is-backgrounded');
    videoStorage.set(playingKey, 'true');
    updateVideoControls();
  });
  heroVideo.addEventListener('pause', updateVideoControls);
}

videoPlay.addEventListener('click', () => {
  if (heroVideo.ended) {
    seekInternally(0, () => heroVideo.play().catch(() => {}));
  } else if (heroVideo.paused) {
    heroVideo.play().catch(() => {});
  } else {
    heroVideo.pause();
  }
});

videoFullscreen.addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else videoWrap.requestFullscreen?.();
});

document.querySelectorAll('a[href^="https://pay.cakto.com.br"]').forEach((link) => {
  link.addEventListener('click', pauseVideoWhenLeaving);
});

window.addEventListener('blur', pauseVideoWhenLeaving);
window.addEventListener('focus', restoreVideoFrame);
window.addEventListener('pagehide', pauseVideoWhenLeaving);
window.addEventListener('pageshow', restoreVideoFrame);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseVideoWhenLeaving();
  else restoreVideoFrame();
});
