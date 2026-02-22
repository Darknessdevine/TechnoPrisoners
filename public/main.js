const userBar = document.getElementById('user-bar');
const registerForm = document.getElementById('register-form');
const loginForm = document.getElementById('login-form');
const videosContainer = document.getElementById('videos');
const message = document.getElementById('message');
const subscriptionCard = document.getElementById('subscription-card');
const subscribeBtn = document.getElementById('subscribe-btn');
const adminCard = document.getElementById('admin-card');
const videoForm = document.getElementById('video-form');
const cancelEditBtn = document.getElementById('cancel-edit');
const adminList = document.getElementById('admin-list');

let currentUser = null;

function setMessage(text, isError = false) {
  message.textContent = text;
  message.style.color = isError ? '#ff6b6b' : '#8de39f';
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

function renderUserBar() {
  if (!currentUser) {
    userBar.innerHTML = '<span>Not logged in</span>';
    return;
  }

  userBar.innerHTML = `
    <div class="inline">
      <span>Hello, ${currentUser.name}</span>
      <span>${currentUser.isSubscriber ? '⭐ Premium' : 'Free Member'}</span>
      ${currentUser.isAdmin ? '<span>🛠️ Admin</span>' : ''}
      <button id="logout-btn" class="secondary">Logout</button>
    </div>
  `;

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' });
    currentUser = null;
    setMessage('Logged out.');
    await refresh();
  });
}

function renderVideos(videos) {
  videosContainer.innerHTML = videos
    .map(
      (video) => `
      <article class="video">
        <h3>${video.title} ${video.isPremium ? '🔒' : ''}</h3>
        <p>${video.description || ''}</p>
        ${
          video.canWatch
            ? `<iframe src="${video.videoUrl}" title="${video.title}" allowfullscreen></iframe>`
            : '<p>Premium tutorial. Subscribe to watch the full lesson.</p>'
        }
      </article>
    `
    )
    .join('');
}

async function loadVideos() {
  const data = await api('/api/videos');
  renderVideos(data.videos);
}

async function loadAdminVideos() {
  if (!currentUser?.isAdmin) {
    adminList.innerHTML = '';
    return;
  }

  const data = await api('/api/admin/videos');
  adminList.innerHTML = data.videos
    .map(
      (v) => `
    <div class="video">
      <strong>${v.title}</strong> ${v.is_premium ? '🔒' : ''}
      <p>${v.description || ''}</p>
      <p class="hint">${v.video_url}</p>
      <button data-edit='${JSON.stringify({
        id: v.id,
        title: v.title,
        description: v.description,
        videoUrl: v.video_url,
        isPremium: Boolean(v.is_premium)
      })}'>Edit</button>
      <button data-delete='${v.id}' class="secondary">Delete</button>
    </div>
  `
    )
    .join('');

  adminList.querySelectorAll('button[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api(`/api/admin/videos/${btn.dataset.delete}`, { method: 'DELETE' });
      setMessage('Video deleted.');
      await refresh();
    });
  });

  adminList.querySelectorAll('button[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const data = JSON.parse(btn.dataset.edit);
      videoForm.id.value = data.id;
      videoForm.title.value = data.title;
      videoForm.description.value = data.description || '';
      videoForm.videoUrl.value = data.videoUrl;
      videoForm.isPremium.checked = data.isPremium;
      cancelEditBtn.classList.remove('hidden');
      window.scrollTo({ top: adminCard.offsetTop, behavior: 'smooth' });
    });
  });
}

async function refresh() {
  const session = await api('/api/session');
  currentUser = session.user;
  renderUserBar();
  subscriptionCard.classList.toggle('hidden', !currentUser || currentUser.isSubscriber || currentUser.isAdmin);
  adminCard.classList.toggle('hidden', !currentUser?.isAdmin);
  await loadVideos();
  await loadAdminVideos();
}

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(registerForm);
  try {
    const data = await api('/api/register', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(form.entries()))
    });
    currentUser = data.user;
    setMessage('Account created. Welcome!');
    registerForm.reset();
    await refresh();
  } catch (error) {
    setMessage(error.message, true);
  }
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(loginForm);
  try {
    const data = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(form.entries()))
    });
    currentUser = data.user;
    setMessage('Logged in successfully.');
    loginForm.reset();
    await refresh();
  } catch (error) {
    setMessage(error.message, true);
  }
});

subscribeBtn.addEventListener('click', async () => {
  try {
    const data = await api('/api/subscribe', { method: 'POST' });
    currentUser = data.user;
    setMessage(data.message);
    await refresh();
  } catch (error) {
    setMessage(error.message, true);
  }
});

videoForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    title: videoForm.title.value,
    description: videoForm.description.value,
    videoUrl: videoForm.videoUrl.value,
    isPremium: videoForm.isPremium.checked
  };

  try {
    if (videoForm.id.value) {
      await api(`/api/admin/videos/${videoForm.id.value}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      setMessage('Video updated.');
    } else {
      await api('/api/admin/videos', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      setMessage('Video uploaded.');
    }

    videoForm.reset();
    videoForm.id.value = '';
    cancelEditBtn.classList.add('hidden');
    await refresh();
  } catch (error) {
    setMessage(error.message, true);
  }
});

cancelEditBtn.addEventListener('click', () => {
  videoForm.reset();
  videoForm.id.value = '';
  cancelEditBtn.classList.add('hidden');
});

refresh().catch((error) => setMessage(error.message, true));
