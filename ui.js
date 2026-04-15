import { escapeHTML, formatDistance, isOpen, getClosedDaysText } from './utils.js';
import { state, setPreviousView, setCurrentDetailSpotId } from './state.js';
import { loadComments } from './data.js';
import { mainMap } from './map.js';

// 詳細ビューを表示
export function showDetail(id) {
    const activeView = document.querySelector('.view-section.active');
    if (activeView && activeView.id !== 'view-detail') {
        setPreviousView(activeView.id);
    }
    setCurrentDetailSpotId(id);

    const spot = state.allSpots.find(s => s.id === id);
    if (!spot) return;

    document.getElementById('detail-title').innerText = spot.name;
    document.getElementById('detail-placename').innerHTML = `<span>${escapeHTML(spot.placename)}</span>` + (spot.floor ? `<span class="popup-floor">${escapeHTML(spot.floor)}</span>` : "");
    document.getElementById('detail-meta').innerHTML = `<span>${escapeHTML(spot.available_hours) || "24時間営業"}</span>${getClosedDaysText(spot.closed_days)}`;

    const imgEl = document.getElementById('detail-image');
    if (spot.imageUrl) {
        imgEl.src = spot.imageUrl;
        imgEl.style.display = 'block';
    } else {
        imgEl.style.display = 'none';
    }

    document.getElementById('detail-features').innerHTML = (spot.features || []).map(f => `<span class="feature-badge">${escapeHTML(f)}</span>`).join('');
    loadComments(id); // data.jsからインポート

    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
    document.getElementById('view-detail').classList.add('active');
    window.scrollTo(0, 0);
}

// 前のビューに戻る
export function goBack() {
    document.querySelector(`[data-target="${state.previousView}"]`).click();
}

// リスト（マップ上、フルリスト）を更新
export function updateLists(spots, userLoc, filterOpen) {
    const mapList = document.getElementById("map-visible-list");
    const mapBounds = mainMap.getBounds();
    const visibleSpots = spots.filter(s => mapBounds.contains(L.latLng(s.lat, s.lng)));

    mapList.innerHTML = visibleSpots.length
        ? visibleSpots.map(s => createCompactCard(s, 'flyToSpot')).join('')
        : `<div class="empty-message-pill">このエリアに見つかりませんでした</div>`;

    const fullList = document.getElementById("full-spot-list");
    const sortBy = document.getElementById("sort-select").value;
    let displaySpots = [...spots];

    if (userLoc) {
        displaySpots.forEach(s => s.distance = getDistance(userLoc[0], userLoc[1], s.lat, s.lng));
    }
    if (filterOpen) {
        displaySpots = displaySpots.filter(s => isOpen(s));
    }
    if (sortBy === "distance" && userLoc) {
        displaySpots.sort((a, b) => a.distance - b.distance);
    } else {
        displaySpots.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    }

    fullList.innerHTML = displaySpots.map(s => createListCard(s, 'showDetail')).join('') || "<p class='text-center text-sub mt-lg'>条件に合うスポットがありません</p>";

    // マップ上のピンの表示/非表示を更新
    spots.forEach(spot => {
        const isVisible = filterOpen ? isOpen(spot) : true;
        if (isVisible) {
            if (!mainMap.hasLayer(spot.marker)) spot.marker.addTo(mainMap);
        } else {
            if (mainMap.hasLayer(spot.marker)) mainMap.removeLayer(spot.marker);
        }
    });
}


// 各種HTMLテンプレート生成
function createListCard(spot, action) {
    const os = isOpen(spot);
    const dt = spot.distance ? `<span class="dist-badge">${formatDistance(spot.distance)}</span>` : "";
    const fh = (spot.features || []).map(f => `<span class="feature-badge">${escapeHTML(f)}</span>`).join('');
    return `
        <div class="spot-card clickable-card spot-card-link" data-action="${action}" data-id="${spot.id}">
            <span class="status-badge ${os ? 'status-open' : 'status-closed'}">${os ? '営業中' : '時間外'}</span>
            <div class="popup-placename mb-sm"><span>${escapeHTML(spot.placename)}</span> ${spot.floor ? `<span class="popup-floor">${escapeHTML(spot.floor)}</span>` : ""}</div>
            <div class="spot-title">${escapeHTML(spot.name)}</div>
            <div class="mb-sm mt-sm">${fh}</div>
            <div class="spot-meta">${dt}<span>${escapeHTML(spot.available_hours) || "24時間営業"}</span>${getClosedDaysText(spot.closed_days)}</div>
        </div>`;
}

function createCompactCard(spot, action) {
    const os = isOpen(spot);
    const dt = spot.distance ? `<span class="dist-badge">${formatDistance(spot.distance)}</span>` : "";
    return `
        <div class="spot-card compact clickable-card spot-card-link" data-action="${action}" data-id="${spot.id}">
            <span class="status-badge ${os ? 'status-open' : 'status-closed'}">${os ? '営業中' : '時間外'}</span>
            <div class="popup-placename"><span>${escapeHTML(spot.placename)}</span></div>
            <div class="spot-title">${escapeHTML(spot.name)}</div>
            <div class="spot-meta">${dt}<span>${escapeHTML(spot.available_hours) || "24時間営業"}</span></div>
        </div>`;
}

// モーダル関連
export function openReportModal() {
    document.getElementById('report-modal').style.display = 'flex';
}
export function closeReportModal() {
    document.getElementById('report-modal').style.display = 'none';
    document.getElementById('report-text').value = '';
}