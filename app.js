import { state, setAllSpots, setUserLocation, setFilterOpenOnly } from './state.js';
import { showDetail, goBack, updateLists, openReportModal, closeReportModal } from './ui.js';
import { fetchSpots, submitSpot, submitReport, submitComment } from './data.js';
import { mainMap, addMap, initAddMap, setupScrollList } from './map.js';

// ===== アプリケーションの初期化 =====
document.addEventListener('DOMContentLoaded', async () => {
    setupScrollList();
    setTimeout(() => mainMap.invalidateSize(), 500);
    
    setupEventListeners();
    
    try {
        const spots = await fetchSpots();
        setAllSpots(spots);
        updateLists(state.allSpots, state.userLocation, state.filterOpenOnly);
    } catch(err) {
        console.error("スポットの初期読み込みに失敗:", err);
        document.getElementById("full-spot-list").innerHTML = "<p class='text-center text-danger mt-lg'>データの読み込みに失敗しました。</p>";
    }
});

// ===== イベントリスナーの一括登録 =====
function setupEventListeners() {
    // 1. ボトムナビゲーション
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => handleNavClick(e.currentTarget));
    });

    // 2. イベント委譲（カードクリック）
    document.addEventListener('click', (e) => {
        const card = e.target.closest('.spot-card-link');
        if (!card) return;
        const { action, id } = card.dataset;
        if (action === 'flyToSpot') flyToSpot(id);
        if (action === 'showDetail') showDetail(id);
    });

    // 3. フォームとボタン
    document.getElementById('gps-btn').addEventListener('click', (e) => handleGpsClick(e, 'gps-btn-text', '現在地周辺を検索', true));
    document.getElementById('btn-get-location').addEventListener('click', (e) => handleGpsClick(e, 'add-gps-text', '現在地を取得', false));
    
    document.getElementById('sort-select').addEventListener('change', handleFilterChange);
    document.getElementById('filter-open').addEventListener('click', handleFilterChange);

    document.getElementById('add-spot-form').addEventListener('submit', handleSpotSubmit);
    document.getElementById('add-comment-form').addEventListener('submit', handleCommentSubmit);

    document.getElementById('detail-back-btn').addEventListener('click', goBack);
    document.getElementById('detail-map-btn').addEventListener('click', () => { if (state.currentDetailSpotId) flyToSpot(state.currentDetailSpotId); });
    
    document.getElementById('open-report-btn').addEventListener('click', openReportModal);
    document.getElementById('close-report-btn').addEventListener('click', closeReportModal);
    document.getElementById('submit-report-btn').addEventListener('click', handleReportSubmit);

    // 4. マップイベント
    mainMap.on('moveend', () => updateLists(state.allSpots, state.userLocation, state.filterOpenOnly));
}

// ===== イベントハンドラ（処理の呼び出し） =====

function handleNavClick(target) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    target.classList.add('active');
    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));

    const targetId = target.dataset.target;
    document.getElementById(targetId).classList.add('active');

    if (targetId !== 'view-detail') state.previousView = targetId;
    if (targetId === 'view-map') requestAnimationFrame(() => mainMap.invalidateSize());
    if (targetId === 'view-add') {
        initAddMap();
        setTimeout(() => { if (addMap) addMap.invalidateSize(); }, 100);
    }
    window.scrollTo(0, 0);
}

function flyToSpot(id) {
    const spot = state.allSpots.find(s => s.id === id);
    if (!spot) return;
    document.querySelector('[data-target="view-map"]').click();
    mainMap.flyTo([spot.lat, spot.lng], 18, { animate: true });
    setTimeout(() => { if (spot.marker) spot.marker.openPopup(); }, 800);
}

function handleGpsClick(e, textElId, defaultText, shouldFlyMainMap) {
    const btnEl = e.currentTarget;
    const textEl = document.getElementById(textElId);
    if (!navigator.geolocation) return alert("お使いの端末は位置情報に対応していません。");

    btnEl.disabled = true;
    textEl.innerText = "取得中...";

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const coords = [pos.coords.latitude, pos.coords.longitude];
            if (state.userMarker) mainMap.removeLayer(state.userMarker);
            const newMarker = L.circleMarker(coords, { radius: 8, fillColor: "#007AFF", color: "#FFFFFF", weight: 3, opacity: 1, fillOpacity: 1 }).addTo(mainMap);
            setUserLocation(coords, newMarker);

            if (shouldFlyMainMap) {
                mainMap.flyTo(coords, 16);
                updateLists(state.allSpots, state.userLocation, state.filterOpenOnly);
            } else if (addMap) {
                addMap.flyTo(coords, 18);
            }
        },
        (err) => { alert("位置情報の取得に失敗しました。"); },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    ).finally(() => {
        btnEl.disabled = false;
        textEl.innerText = defaultText;
    });
}

function handleFilterChange() {
    setFilterOpenOnly(document.getElementById('filter-open').classList.contains('active'));
    updateLists(state.allSpots, state.userLocation, state.filterOpenOnly);
}

async function handleSpotSubmit(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerText = "送信中...";

    try {
        const is24hMode = document.getElementById('btn-24h').classList.contains('active');
        const formData = {
            name: document.getElementById('add-name').value,
            placename: document.getElementById('add-placename').value,
            floor: document.getElementById('add-floor').value,
            hours: is24hMode ? "24時間営業" : document.getElementById('add-hours').value,
            features: Array.from(document.querySelectorAll('input[name="features"]:checked')).map(cb => cb.value),
            closed_days: Array.from(document.querySelectorAll('input[name="closed_days"]:checked')).map(cb => parseInt(cb.value)),
            lat: addMap.currentLat,
            lng: addMap.currentLng,
            imageFile: document.getElementById('add-image').files[0] || null,
        };
        await submitSpot(formData);
        alert("申請が完了しました。管理者の承認後にマップに反映されます。");
        e.target.reset();
        document.querySelector('[data-target="view-map"]').click();
    } catch (err) {
        alert("送信中にエラーが発生しました。");
    } finally {
        btn.disabled = false;
        btn.innerText = "この内容で申請する";
    }
}

async function handleCommentSubmit(e) {
    e.preventDefault();
    if (!state.currentDetailSpotId) return;
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerText = "送信中...";

    try {
        const commentData = {
            spotId: state.currentDetailSpotId,
            name: document.getElementById('comment-name').value,
            text: document.getElementById('comment-text').value,
        };
        await submitComment(commentData);
        e.target.reset();
        showDetail(state.currentDetailSpotId); // コメントを再読み込みしてUIを更新
        btn.innerText = "完了";
        setTimeout(() => { btn.innerText = "コメントを送信"; btn.disabled = false; }, 2000);
    } catch (err) {
        alert('送信に失敗しました');
        btn.disabled = false;
        btn.innerText = "コメントを送信";
    }
}

async function handleReportSubmit() {
    const btn = document.getElementById('submit-report-btn');
    const text = document.getElementById('report-text').value;
    if (!text) return alert("詳細を入力してください。");

    btn.disabled = true;
    btn.innerText = "送信中...";

    try {
        await submitReport({
            spotId: state.currentDetailSpotId,
            category: document.getElementById('report-category').value,
            text: text,
        });
        alert("報告を送信しました。ご協力ありがとうございます。");
        closeReportModal();
    } catch (e) {
        alert("送信に失敗しました。");
    } finally {
        btn.disabled = false;
        btn.innerText = "送信";
    }
}
