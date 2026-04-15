export const MAP_TILE_URL = 'https://tile.tracestrack.com/ja/{z}/{x}/{y}.png?key=27e171dc5ca2cc214ecf5ab9d0f493bd';
export const MAP_ATTRIBUTION = '&copy; OpenStreetMap contributors';

export const mainMap = L.map('map', { zoomControl: false }).setView([35.6061, 139.6833], 16);
L.tileLayer(MAP_TILE_URL, { maxZoom: 19, attribution: MAP_ATTRIBUTION }).addTo(mainMap);

export let addMap = null;

export function initAddMap() {
    if (addMap) return;
    addMap = L.map('add-map', { zoomControl: false }).setView([35.6061, 139.6833], 16);
    L.tileLayer(MAP_TILE_URL, { maxZoom: 19 }).addTo(addMap);
    
    const pinEl = document.getElementById('center-pin');
    addMap.currentLat = 35.6061; 
    addMap.currentLng = 139.6833;
    
    addMap.on('movestart', () => pinEl.classList.add('moving'));
    addMap.on('move', () => { 
        const center = addMap.getCenter(); 
        addMap.currentLat = center.lat; 
        addMap.currentLng = center.lng; 
    });
    addMap.on('moveend', () => pinEl.classList.remove('moving'));
}

export function createCustomIcon(color) { 
    return L.divIcon({ 
        className: 'custom-pin', 
        html: `<svg viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="4" fill="white"></circle></svg>`, 
        iconSize:[36,36], 
        iconAnchor: [18,36], 
        popupAnchor:[0,-34] 
    }); 
}

// パッシブイベントリスナー対応を含む横スクロールロジックのセットアップ
export function setupScrollList() {
    const scrollList = document.getElementById('map-visible-list');
    let isDown = false; 
    let startX; 
    let scrollLeft;
    
    scrollList.addEventListener('mousedown', (e) => { 
        isDown = true; 
        startX = e.pageX - scrollList.offsetLeft; 
        scrollLeft = scrollList.scrollLeft; 
    });
    scrollList.addEventListener('mouseleave', () => { isDown = false; });
    scrollList.addEventListener('mouseup', () => { isDown = false; });
    scrollList.addEventListener('mousemove', (e) => { 
        if (!isDown) return; 
        e.preventDefault(); 
        const x = e.pageX - scrollList.offsetLeft; 
        const walk = (x - startX) * 2; 
        scrollList.scrollLeft = scrollLeft - walk; 
    });
    
    scrollList.addEventListener('wheel', (e) => { 
        if(e.deltaY !== 0) { 
            e.preventDefault(); 
            scrollList.scrollLeft += e.deltaY; 
        } 
    }, { passive: false });
}