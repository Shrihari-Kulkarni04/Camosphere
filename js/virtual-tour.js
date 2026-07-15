// virtual-tour.js
const LOCATIONS = {
  main:    { icon:'🏢', title:'Main Building',  desc:'The main administrative and academic building of LIT Sarigam featuring modern classrooms and offices.' },
  labs:    { icon:'🔬', title:'Laboratories',   desc:'State-of-the-art labs for Computer Science, Electronics, Mechanical, and Civil Engineering departments.' },
  library: { icon:'📚', title:'Library',        desc:'A vast collection of technical books, journals, and digital resources for students and faculty.' },
  canteen: { icon:'🍽️', title:'Canteen',        desc:'A spacious cafeteria offering a variety of meals and snacks for the college community.' },
  ground:  { icon:'⚽', title:'Sports Ground',  desc:'Multi-sport ground with facilities for cricket, football, basketball, and athletics.' },
};

document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.loc-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.loc-btn').forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
      const loc = LOCATIONS[btn.dataset.loc];
      document.getElementById('tour-icon').textContent       = loc.icon;
      document.getElementById('tour-loc-title').textContent  = loc.title;
      document.getElementById('tour-loc-desc').textContent   = loc.desc;
    });
  });
});
