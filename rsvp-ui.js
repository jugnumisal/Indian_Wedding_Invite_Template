// === RSVP Floating UI ===
(function initRSVPFloatingUI() {
  const auth = pageAccess.auth;

  function positionRSVPFab() {
    const fab = document.getElementById('rsvp-fab');
    if (!fab) return;
    fab.style.bottom = '20px';
  }

  function createRSVPFab() {
    if (document.getElementById('rsvp-fab')) return;

    const fab = document.createElement('button');
    fab.id = 'rsvp-fab';
    fab.className = 'rsvp-fab';
    fab.textContent = 'RSVP';
    fab.addEventListener('click', openRSVPModal);
    document.body.appendChild(fab);
    positionRSVPFab();
  }

  async function openRSVPModal() {
    if (document.getElementById('rsvp-modal')) {
      document.getElementById('rsvp-modal').style.display = 'block';
      return;
    }

    // Fetch fresh guest data from API to get latest maxGuests value
    const token = auth.getCookie(auth.tokenKey) || localStorage.getItem(auth.tokenKey);
    let maxGuests = 1;
    
    try {
      const response = await fetch(`${auth.apiBase}/auth/validate-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      
      if (response.ok) {
        const data = await response.json();
        const freshUser = data.user || data;
        maxGuests = freshUser?.maxGuests ?? freshUser?.max_guests ?? 1;
        
        // Update cached user info with fresh data
        auth.setCookie(auth.userKey, JSON.stringify(freshUser), 4);
        localStorage.setItem(auth.userKey, JSON.stringify(freshUser));
      } else {
        // Fallback to cached data if API fails
        const user = auth.getUserInfo();
        maxGuests = user?.maxGuests ?? user?.max_guests ?? 1;
      }
    } catch (error) {
      console.error('Failed to fetch fresh guest data:', error);
      // Fallback to cached data
      const user = auth.getUserInfo();
      maxGuests = user?.maxGuests ?? user?.max_guests ?? 1;
    }

    const modal = document.createElement('div');
    modal.id = 'rsvp-modal';
    modal.className = 'rsvp-modal';
    modal.innerHTML = `
      <div class="rsvp-modal__dialog">
        <button class="modal-close" type="button" aria-label="Close" onclick="document.getElementById('rsvp-modal').style.display='none'">&times;</button>
        <h3>Confirm RSVP</h3>

        <div class="rsvp-field">
          <label>Will you attend?</label>
          <div class="rsvp-radios">
            <label><input type="radio" name="attending" value="yes" checked> Yes</label>
            <label><input type="radio" name="attending" value="no"> No</label>
          </div>
        </div>

        <div class="rsvp-field" id="guestCountField">
          <label>Number of guests</label>
          <select id="guestCount"></select>
        </div>

        <div class="rsvp-actions">
          <button id="rsvpSubmitBtn" class="rsvp-submit">Submit</button>
          <button class="rsvp-cancel" onclick="document.getElementById('rsvp-modal').style.display='none'">Cancel</button>
        </div>

        <div id="rsvpMessage" class="rsvp-message" style="display:none;"></div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.style.display = 'block';



    // Populate dropdown 1..maxGuests
    const sel = document.getElementById('guestCount');
    sel.innerHTML = Array.from({ length: maxGuests }, (_, i) => i + 1)
      .map(n => `<option value="${n}">${n}</option>`)
      .join('');

    // Preselect the maximum number by default
    sel.value = String(maxGuests);

    // Hide guest count when "No" is chosen
    modal.querySelectorAll('input[name="attending"]').forEach(r => {
      r.addEventListener('change', () => {
        const v = document.querySelector('input[name="attending"]:checked').value;
        document.getElementById('guestCountField').style.display = (v === 'yes') ? '' : 'none';
      });
    });

    document.getElementById('rsvpSubmitBtn').onclick = submitRSVP;
  }

  let submittingRSVP = false;

  async function submitRSVP() {
    if (submittingRSVP) return;
    submittingRSVP = true;

    try {
      const attending = document.querySelector('input[name="attending"]:checked').value === 'yes';
      const gcField = document.getElementById('guestCount');
      const guestCount = attending ? parseInt(gcField.value, 10) : 0;

      const token = auth.getCookie(auth.tokenKey) || localStorage.getItem(auth.tokenKey);
      const apiBase = pageAccess.auth.apiBase;

      const statusRes = await fetch(`${apiBase}/rsvp/status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const status = await statusRes.json();
      if (!status.canRSVP) {
        showRSVPMessage('This code has already been used to submit an RSVP.', true);
        return;
      }

      const res = await fetch(`${apiBase}/rsvp/submit`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ attending, guestCount })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        showRSVPMessage(data.error || 'Submission failed. Please try again.', true);
        return;
      }

      // Success with confirmation ID
      const id = data.confirmationId || data.confirmation_id;
      const message = attending
        ? "We're looking forward to your presence at our wedding!"
        : "We're sad you cannot attend. You can stream the live telecast on the home screen during the event.";
      
      showRSVPMessage(message, false, id);

      // Update session
      const user = auth.getUserInfo() || {};
      user.rsvp_submitted = true;
      user.canRSVP = false;
      auth.setCookie(auth.userKey, JSON.stringify(user), 4);
      localStorage.setItem(auth.userKey, JSON.stringify(user));

      // Remove FAB immediately
      document.getElementById('rsvp-fab')?.remove();

      // Don't auto-close modal - let user close it manually with X button
    } finally {
      submittingRSVP = false;
    }
  }

  function showRSVPMessage(text, isError, confirmationId) {
    const box = document.getElementById('rsvpMessage');
    if (!box) return;

    // Reset content & classes
    box.className = 'rsvp-message ' + (isError ? 'error' : 'success');
    box.innerHTML = '';
    box.style.display = 'block';

    // Build message
    const icon = document.createElement('span');
    icon.className = 'msg-icon';
    icon.textContent = isError ? '⚠️' : '💜';

    const msg = document.createElement('div');
    msg.className = 'msg-text';
    msg.textContent = text;

    const row = document.createElement('div');
    row.className = 'msg-row';
    row.appendChild(icon);
    row.appendChild(msg);
    box.appendChild(row);

    if (confirmationId) {
      const chip = document.createElement('div');
      chip.className = 'id-chip';
      chip.textContent = `Confirmation ID: ${confirmationId}`;
      box.appendChild(chip);
    }
  }

  // Check and show FAB if user can RSVP
  async function checkAndShowRSVPFab() {
    const auth = pageAccess?.auth;
    if (!auth || !auth.isAuthenticated()) return;

    try {
      const token = auth.getCookie(auth.tokenKey) || localStorage.getItem(auth.tokenKey);
      const res = await fetch(`${auth.apiBase}/rsvp/status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return;
      const status = await res.json();
      if (status.canRSVP && !document.getElementById('rsvp-fab')) {
        createRSVPFab();
      }
    } catch (e) {
      console.log('RSVP status check failed:', e);
    }
  }

  // Re-check after login occurs
  document.addEventListener('wedding:auth:login', checkAndShowRSVPFab);

  // Also check on page load
  document.addEventListener('DOMContentLoaded', checkAndShowRSVPFab);

  // Keep FAB positioned
  window.addEventListener('resize', positionRSVPFab);
  const __rsvpFabObserver = new MutationObserver(positionRSVPFab);
  __rsvpFabObserver.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('wedding:auth:login', positionRSVPFab);
})();
