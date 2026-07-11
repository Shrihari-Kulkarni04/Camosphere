// ═══════════════════════════════════════
//  guava-ai.js —  chatbot logic for LIT Sarigam website
// ═══════════════════════════════════════

const RESPONSES = {
  'department': 'LIT Sarigam offers BE, DE, BVoc, and DVoc programs. The BE program includes 8 branches: Computer Science Engineering (CSE), Information Technology (IT), Electronics and Communication Engineering (ECE), Electrical Engineering (EE), Mechanical Engineering (ME), Civil Engineering (CE), Automobile Engineering (AE), and the General Department.',
  'map':        'Visit the Campus Map page to view all floor maps for Blocks A to D, from Floor 0 to Floor 2.',
  'tour':       'Take a virtual tour of our campus to explore the main building, labs, library, canteen, and sports ground.',
  'event':      'Check out the Events page for the latest updates on workshops, seminars, cultural fests, and sports events happening at LIT Sarigam.',
  'admission':  'For admissions, please visit the official website of LIT Sarigam or contact the college office.',
  'default':    'I don\'t have an answer for that question yet. Please contact the LIT Sarigam office or visit our website for more information.',
};

function getBotResponse(question) {
  const q = question.toLowerCase();
  if (q.includes('department') || q.includes('branch') || q.includes('course')) return RESPONSES.department;
  if (q.includes('map'))       return RESPONSES.map;
  if (q.includes('tour'))      return RESPONSES.tour;
  if (q.includes('event'))     return RESPONSES.event;
  if (q.includes('admission')) return RESPONSES.admission;
  return RESPONSES.default;
}

function addMessage(text, sender) {
  const chatWindow = document.getElementById('chat-window');
  const div = document.createElement('div');
  div.className = 'chat-msg ' + sender;
  div.innerHTML =
    '<div class="msg-avatar">' + (sender === 'bot' ? '🤖' : '👤') + '</div>' +
    '<div class="msg-bubble">' + text + '</div>';
  chatWindow.appendChild(div);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function showTyping() {
  const chatWindow = document.getElementById('chat-window');
  const div = document.createElement('div');
  div.className = 'chat-msg bot typing-indicator';
  div.id = 'typing';
  div.innerHTML = '<div class="msg-avatar">🤖</div><div class="msg-bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div>';
  chatWindow.appendChild(div);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function hideTyping() {
  const t = document.getElementById('typing');
  if (t) t.remove();
}

function sendMessage(text) {
  if (!text.trim()) return;
  addMessage(text, 'user');
  document.getElementById('chat-input').value = '';
  document.getElementById('quick-suggestions').style.display = 'none';

  showTyping();
  setTimeout(function () {
    hideTyping();
    addMessage(getBotResponse(text), 'bot');
  }, 900);
}

document.addEventListener('DOMContentLoaded', function () {
  // Send button
  document.getElementById('send-btn').addEventListener('click', function () {
    sendMessage(document.getElementById('chat-input').value);
  });

  // Enter key
  document.getElementById('chat-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') sendMessage(this.value);
  });

  // Quick suggestion buttons
  document.querySelectorAll('.suggestion-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      sendMessage(btn.dataset.q);
    });
  });
});
