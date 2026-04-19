function initModalSystem() {
  if (document.getElementById('modal-container')) return; // Already exists

  const container = document.createElement('div');
  container.id = 'modal-container';
  container.innerHTML = `
    <div id="modal-overlay" class="modal-overlay"></div>
    <div id="modal-box" class="modal-box">
      <div class="modal-header">
        <h3 id="modal-title">Alert</h3>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <div id="modal-body" class="modal-body"></div>
      <div class="modal-footer">
        <button class="modal-btn-primary" onclick="closeModal()">OK</button>
      </div>
    </div>
  `;
  document.body.appendChild(container);
  
  const overlay = document.getElementById('modal-overlay');
  if (overlay) {
    overlay.addEventListener('click', closeModal);
  }
}

function showAlert(title, message, type = 'info') {
  initModalSystem();

  const box = document.getElementById('modal-box');
  const header = document.getElementById('modal-title');
  const body = document.getElementById('modal-body');

  header.textContent = title;
  body.innerHTML = message;
  
  box.className = `modal-box modal-${type}`;

  // Show modal
  document.getElementById('modal-overlay').classList.add('active');
  box.classList.add('active');

  if (type === 'info') {
    setTimeout(() => closeModal(), 5000);
  }
}

function alert_warning(title, message) {
  showAlert(title, message, 'warning');
}

function alert_error(title, message) {
  showAlert(title, message, 'error');
}

function alert_success(title, message) {
  showAlert(title, message, 'success');
}

function alert_info(title, message) {
  showAlert(title, message, 'info');
}

function closeModal() {
  const box = document.getElementById('modal-box');
  const overlay = document.getElementById('modal-overlay');
  
  if (box) box.classList.remove('active');
  if (overlay) overlay.classList.remove('active');
}
