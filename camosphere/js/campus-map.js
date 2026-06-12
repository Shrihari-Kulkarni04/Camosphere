// campus-map.js

document.addEventListener('DOMContentLoaded', function () {
  const labels = {
    'A-0': 'Block A - Floor 0',
    'A-1': 'Block A - Floor 1',
    'A-2': 'Block A - Floor 2',
    'B-0': 'Block B - Floor 0',
    'B-1': 'Block B - Floor 1',
    'B-2': 'Block B - Floor 2',
    'C-0': 'Block C - Floor 0',
    'C-1': 'Block C - Floor 1',
    'C-2': 'Block C - Floor 2',
    'D-0': 'Block D - Floor 0',
    'D-1': 'Block D - Floor 1',
    'D-2': 'Block D - Floor 2'
  };

  const SUPABASE_MAPS_URL = 'https://aswlorfbsugnbucwvbzy.supabase.co/storage/v1/object/public/floor-maps';
  const MAP_EXTENSION = 'svg';

  const mapContainer = document.getElementById('map-container');
  const fallback = document.getElementById('map-fallback');
  const mapTitle = document.getElementById('map-title');
  const fallbackLabel = document.getElementById('map-fallback-label');

  document.querySelectorAll('.map-list-btn').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      document.querySelectorAll('.map-list-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      await loadMap(btn.dataset.key);
    });
  });

  const activeButton = document.querySelector('.map-list-btn.active');
  if (activeButton) {
    loadMap(activeButton.dataset.key);
  }

  async function loadMap(key) {
    const label = labels[key] || key;
    const url = `${SUPABASE_MAPS_URL}/${encodeURIComponent(key)}.${MAP_EXTENSION}`;

    mapTitle.textContent = label;
    fallbackLabel.textContent = label;
    fallback.style.display = 'none';
    mapContainer.textContent = 'Loading...';

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Map not found: ${res.status}`);

      const svgText = await res.text();
      const svgStart = svgText.indexOf('<svg');
      if (svgStart === -1) {
        renderMapImage(url, label);
        return;
      }

      mapContainer.innerHTML = svgText.slice(svgStart);
      addSVGInteraction();
    } catch (error) {
      console.error('Inline SVG load failed, trying image fallback:', error);
      renderMapImage(url, label);
    }
  }

  function renderMapImage(url, label) {
    const img = new Image();
    img.alt = label;

    img.onload = function () {
      mapContainer.innerHTML = '';
      mapContainer.appendChild(img);
      fallback.style.display = 'none';
    };

    img.onerror = function () {
      mapContainer.innerHTML = '';
      fallback.style.display = 'flex';
    };

    img.src = url;
  }

  function addSVGInteraction() {
    const rooms = document.querySelectorAll('#map-container svg [id]');

    rooms.forEach(room => {
      room.style.cursor = 'pointer';

      room.addEventListener('click', () => {
        alert('Clicked: ' + room.id);
      });

      room.addEventListener('mouseenter', () => {
        room.style.opacity = '0.7';
      });

      room.addEventListener('mouseleave', () => {
        room.style.opacity = '1';
      });
    });
  }
});
