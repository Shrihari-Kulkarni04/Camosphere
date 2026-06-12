
/* dashboard.js*/
document.addEventListener('DOMContentLoaded', function () {
 
  const user = Session.get('user');
 
  // If not logged in, redirect
  if (!user) { window.location.href = 'index.html?loginRequired=1&next=dashboard.html'; return; }
 
  // Fill user info
  document.getElementById('user-role').textContent = user.role || '—';
  document.getElementById('user-id').textContent   = user.identifier || user.name || '—';
 
  // Admin specific
  if (user.role === 'admin') {
    // Show admin stats
    document.getElementById('admin-stats').classList.remove('hidden');
 
    // Show Edit My Details button
    document.getElementById('edit-own-details-btn').classList.remove('hidden');
 
    // Show Manage button in every card
    document.querySelectorAll('.admin-only').forEach(function (el) {
      el.classList.remove('hidden');
    });
  }
 
  // Edit My Details
  document.getElementById('edit-own-details-btn').addEventListener('click', function () {
    const newName = prompt('Enter new Name / ID:');
    if (newName) {
      user.identifier = newName;
      Session.set('user', user);
      document.getElementById('user-id').textContent = newName;
      alert('Details updated successfully!');
    }
  });
 
  // Logout
  document.getElementById('logout-btn').addEventListener('click', function () {
    Session.clear();
    window.location.href = 'index.html';
  });
 
});
 
