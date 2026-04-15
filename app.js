import { db, storage } from './firebase.js';
import { collection, getDocs, addDoc, serverTimestamp, query, where } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { escapeHTML, getDistance, formatDistance, isOpen, getClosedDaysText, getPinColor, compressImage } from './utils.js';
import { mainMap, addMap, initAddMap, createCustomIcon, setupScrollList } from './map.js';

// ===== State (状態管理) =====
let allSpots =[];
let userLocation = null;
let userMarker = null;
let filterOpenOnly = false;
let previousView = 'view-map';
let currentDetailSpotId = null;

// ===== 初期化処理 =====
document.addEventListener('DOMContentLoaded', () => {
    setupScrollList();
    // マップの描画ずれを防ぐため少し遅延させてサイズを再計算
    setTimeout(() => { mainMap.invalidateSize(); }, 500);
    loadSpots();
    setupEventListeners();
});

// ===== イベントリスナーの一括登録 =====
function setupEventListeners() {
    // 1. ボトムナビゲーションの切り替え
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(n => n.classList.remove('active')); 
            item.classList.add('active');
            document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
            
            const tid = item.dataset.target; 
            if (tid !== 'view-detail') previousView = tid;
            
            document.getElementById(tid).classList.add('active');
            if (tid === 'view-map') requestAnimationFrame(() => mainMap.invalidateSize());
            if (tid === 'view-add') { 
                initAddMap(); 
                setTimeout(() => { if (addMap) addMap.invalidateSize(); }, 100); 
            }
            window.scrollTo(0, 0);
        });
    });

    // 2. GPSボタン操作
    document.getElementById('gps-btn').addEventListener('click', (e) => {
        fetchCurrentLocation(e.currentTarget, 'gps-btn-text', '現在地周辺を検索', (success) => { 
            if(success) { mainMap.flyTo(userLocation, 16); updateLists(); }
        });
    });

    document.getElementById('btn-get-location').addEventListener('click', (e) => {
        fetchCurrentLocation(e.currentTarget, 'add-gps-text', '現在地を取得', (success) => { 
            if(success && addMap) addMap.flyTo(userLocation, 18);
        });
    });

    // 3. 絞り込み・ソートフィルター
    document.getElementById("sort-select").addEventListener('change', (e) => { 
        if (e.target.value === "distance" && !userLocation) { 
            if (confirm("現在地に近い順に並び替えるには、位置情報を取得しますか？")) { 
                const btn = document.getElementById('gps-btn'); 
                fetchCurrentLocation(btn, 'gps-btn-text', '現在地周辺を検索', (success) => { 
                    if(success) { 
                        document.getElementById("sort-select").value = "distance"; 
                        updateLists(); 
                    } else { 
                        e.target.value = "default"; 
                    }
                }); 
            } else { 
                e.target.value = "default"; 
            } 
        } else { 
            updateLists(); 
        } 
    });
    
    document.getElementById("filter-open").addEventListener('click', (e) => { 
        filterOpenOnly = !filterOpenOnly; 
        e.currentTarget.classList.toggle('active'); 
        updateLists(); 
    });

    // 4. フォーム：24時間営業ボタン
    let is24hMode = false; 
    const btn24h = document.getElementById('btn-24h'); 
    const inputHours = document.getElementById('add-hours');
    
    btn24h.addEventListener('click', () => { 
        is24hMode = !is24hMode; 
        if (is24hMode) { 
            btn24h.classList.add('active'); 
            inputHours.disabled = true; 
            inputHours.value = ''; 
            inputHours.placeholder = "24時間営業"; 
            inputHours.removeAttribute('required'); 
        } else { 
            btn24h.classList.remove('active'); 
            inputHours.disabled = false; 
            inputHours.placeholder = "例: 09:00 - 18:00"; 
            inputHours.setAttribute('required', 'true'); 
        } 
    });

    // 5. スポット追加フォームの送信
    document.getElementById('add-spot-form').addEventListener('submit', async (e) => {
        e.preventDefault(); 
        const btn = document.getElementById('submit-btn'); 
        btn.disabled = true; 
        btn.innerText = "送信中...";
        
        try {
            const name = document.getElementById('add-name').value; 
            const placename = document.getElementById('add-placename').value; 
            const floor = document.getElementById('add-floor').value; 
            const hours = is24hMode ? "24時間営業" : document.getElementById('add-hours').value;
            const features = Array.from(document.querySelectorAll('input[name="features"]:checked')).map(cb => cb.value);
            const closed_days = Array.from(document.querySelectorAll('input[name="closed_days"]:checked')).map(cb => parseInt(cb.value));
            
            let imageUrl = null; 
            const fileInput = document.getElementById('add-image');
            
            if (fileInput.files.length > 0) { 
                try {
                    const compressedBlob = await compressImage(fileInput.files[0], 1024, 0.8);
                    const randomStr = Math.random().toString(36).substring(2, 8);
                    const storageRef = ref(storage, 'spots/' + Date.now() + '_' + randomStr + '.jpg'); 
                    await uploadBytes(storageRef, compressedBlob); 
                    imageUrl = await getDownloadURL(storageRef); 
                } catch (err) {
                    console.error("画像アップロードエラー:", err);
                    alert("画像のアップロードに失敗しました。画像なしで登録します。");
                }
            }
            
            await addDoc(collection(db, "spots"), { 
                name, placename, floor, available_hours: hours, features, closed_days, 
                lat: addMap.currentLat, lng: addMap.currentLng, imageUrl, 
                approved: false, created_at: serverTimestamp() 
            });
            
            alert("申請が完了しました。管理者の承認後にマップに反映されます。"); 
            e.target.reset(); 
            if(is24hMode) btn24h.click(); 
            document.querySelector('[data-target="view-map"]').click();
        } catch (err) { 
            alert("送信中にエラーが発生しました。"); 
            console.error(err); 
        } finally { 
            btn.disabled = false; 
            btn.innerText = "この内容で申請する"; 
        }
    });

    // 6. 詳細モーダル・報告系のボタン
    document.getElementById('detail-back-btn').addEventListener('click', goBack);
    document.getElementById('detail-map-btn').addEventListener('click', () => {
        if (currentDetailSpotId) flyToSpot(currentDetailSpotId);
    });
    document.getElementById('open-report-btn').addEventListener('click', openReportModal);
    document.getElementById('close-report-btn').addEventListener('click', closeReportModal);
    document.getElementById('submit-report-btn').addEventListener('click', submitReport);

    // 7. コメントの送信
    document.getElementById('add-comment-form').addEventListener('submit', async(e) => { 
        e.preventDefault(); 
        if(!currentDetailSpotId) return; 
        const btn = document.getElementById('submit-comment-btn'); 
        btn.disabled = true; 
        btn.innerText = "送信中..."; 
        
        try{ 
            await addDoc(collection(db, "spots", currentDetailSpotId, "comments"), {
                name: document.getElementById('comment-name').value, 
                text: document.getElementById('comment-text').value, 
                created_at: serverTimestamp()
            }); 
            e.target.reset(); 
            await loadComments(currentDetailSpotId); 
            btn.innerText = "完了"; 
            setTimeout(() => {
                btn.disabled = false;
                btn.innerText = "コメントを送信";
            }, 2000); 
        } catch(err) {
            alert('送信に失敗しました'); 
            btn.disabled = false; 
            btn.innerText = "コメントを送信";
        } 
    });

    // 8. ★イベント委譲によるカード・ピンクリック制御
    document.addEventListener('click', (e) => {
        const card = e.target.closest('.spot-card-link');
        if (!card) return;
        const action = card.dataset.action;
        const id = card.dataset.id;
        if (action === 'flyToSpot') {
            flyToSpot(id);
        } else if (action === 'showDetail') {
            showDetail(id);
        }
    });
}

// ===== コア機能 =====
function fetchCurrentLocation(btnEl, textElId, defaultText, callback) {
    if (!navigator.geolocation) return alert("お使いの端末は位置情報に対応していません。");
    const textEl = document.getElementById(textElId);
    btnEl.disabled = true; 
    textEl.innerText = "取得中...";
    
    navigator.geolocation.getCurrentPosition(
        (pos) => { 
            userLocation = [pos.coords.latitude, pos.coords.longitude]; 
            if (userMarker) mainMap.removeLayer(userMarker); 
            
            userMarker = L.circleMarker(userLocation, { 
                radius: 8, fillColor: "#007AFF", color: "#FFFFFF", weight: 3, opacity: 1, fillOpacity: 1 
            }).addTo(mainMap); 
            
            btnEl.disabled = false; 
            textEl.innerText = defaultText; 
            if(callback) callback(true); 
        },
        (err) => { 
            btnEl.disabled = false; 
            textEl.innerText = defaultText; 
            alert("位置情報の取得に失敗しました。"); 
            if(callback) callback(false); 
        }, 
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}

function flyToSpot(id) { 
    const spot = allSpots.find(s => s.id === id); 
    if (!spot) return; 
    document.querySelector('[data-target="view-map"]').click(); 
    
    mainMap.flyTo([spot.lat, spot.lng], 18, { animate: true }); 
    setTimeout(() => { if (spot.marker) spot.marker.openPopup(); }, 800); 
}

function showDetail(id) {
    const av = document.querySelector('.view-section.active'); 
    if (av && av.id !== 'view-detail') previousView = av.id;
    
    currentDetailSpotId = id; 
    const spot = allSpots.find(s => s.id === id); 
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
    
    document.getElementById('detail-features').innerHTML = (spot.features||[]).map(f => `<span class="feature-badge">${escapeHTML(f)}</span>`).join('');
    
    loadComments(id);
    
    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active')); 
    document.getElementById('view-detail').classList.add('active'); 
    window.scrollTo(0, 0);
}

function goBack() { 
    document.querySelector(`[data-target="${previousView}"]`).click(); 
}

// HTMLテンプレートを生成する関数（onclick排除済み）
function createListCard(spot, action) {
    const os = isOpen(spot); 
    const dt = spot.distance ? `<span class="dist-badge">${formatDistance(spot.distance)}</span>` : "";
    const fh = (spot.features||[]).map(f => `<span class="feature-badge">${escapeHTML(f)}</span>`).join('');
    
    return `
        <div class="spot-card clickable-card spot-card-link" data-action="${action}" data-id="${spot.id}">
            <span class="status-badge ${os ? 'status-open' : 'status-closed'}">${os ? '営業中' : '時間外'}</span>
            <div class="popup-placename mb-sm">
                <span>${escapeHTML(spot.placename)}</span> 
                ${spot.floor ? `<span class="popup-floor">${escapeHTML(spot.floor)}</span>`:""}
            </div>
            <div class="spot-title">${escapeHTML(spot.name)}</div>
            <div class="mb-sm mt-sm">${fh}</div>
            <div class="spot-meta">
                ${dt}<span>${escapeHTML(spot.available_hours)||"24時間営業"}</span>${getClosedDaysText(spot.closed_days)}
            </div>
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
            <div class="spot-meta">${dt}<span>${escapeHTML(spot.available_hours)||"24時間営業"}</span></div>
        </div>`;
}

function updateLists() {
    const mList = document.getElementById("map-visible-list"); 
    const b = mainMap.getBounds();
    
    const vSpots = allSpots.filter(s => b.contains(L.latLng(s.lat, s.lng)));
    
    mList.innerHTML = vSpots.length 
        ? vSpots.map(s => createCompactCard(s, 'flyToSpot')).join('') 
        : `<div class="empty-message-pill">このエリアに見つかりませんでした</div>`;
        
    const fList = document.getElementById("full-spot-list"); 
    const sortBy = document.getElementById("sort-select").value;
    let dSpots = [...allSpots];
    
    if (userLocation) {
        dSpots.forEach(s => s.distance = getDistance(userLocation[0], userLocation[1], s.lat, s.lng));
    }
    
    if (filterOpenOnly) dSpots = dSpots.filter(s => isOpen(s));
    
    if (sortBy === "distance" && userLocation) {
        dSpots.sort((a, b) => a.distance - b.distance); 
    } else {
        dSpots.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    }
    
    fList.innerHTML = dSpots.map(s => createListCard(s, 'showDetail')).join('') || "<p class='text-center text-sub mt-lg'>条件に合うスポットがありません</p>";
    
    allSpots.forEach(spot => { 
        const v = filterOpenOnly ? isOpen(spot) : true; 
        if (v) { 
            if (!mainMap.hasLayer(spot.marker)) spot.marker.addTo(mainMap); 
        } else { 
            if (mainMap.hasLayer(spot.marker)) mainMap.removeLayer(spot.marker); 
        } 
    });
}

async function loadSpots() {
    try {
        const q = query(collection(db, "spots"), where("approved", "==", true));
        const snap = await getDocs(q);
        
        allSpots.forEach(s => { if(s.marker) mainMap.removeLayer(s.marker); }); 
        allSpots =[];
        
        snap.forEach(doc => {
            const spot = doc.data(); 
            spot.id = doc.id;
            
            if (spot.lat && spot.lng) {
                const m = L.marker([spot.lat, spot.lng], { icon: createCustomIcon(getPinColor(spot.features)) });
                
                // ポップアップ内のボタンもイベント委譲で制御
                m.bindPopup(`
                    <div class="custom-popup">
                        <div class="popup-placename"><span>${escapeHTML(spot.placename)}</span></div>
                        <div class="popup-title">${escapeHTML(spot.name)}</div>
                        <button class="popup-btn spot-card-link" data-action="showDetail" data-id="${spot.id}">詳細を見る</button>
                    </div>
                `);
                spot.marker = m; 
                m.addTo(mainMap); 
                allSpots.push(spot);
            }
        });
        updateLists();
    } catch (err) { 
        console.error("データ取得エラー:", err); 
        document.getElementById("full-spot-list").innerHTML = "<p class='text-center text-danger mt-lg'>データの読み込みに失敗しました。</p>"; 
    }
}

mainMap.on('moveend', updateLists);

function openReportModal() { 
    document.getElementById('report-modal').style.display = 'flex'; 
}

function closeReportModal() { 
    document.getElementById('report-modal').style.display = 'none'; 
    document.getElementById('report-text').value = ''; 
}

async function submitReport() {
    const cat = document.getElementById('report-category').value; 
    const txt = document.getElementById('report-text').value; 
    const btn = document.getElementById('submit-report-btn');
    
    if(!txt) return alert("詳細を入力してください。");
    btn.disabled = true; 
    btn.innerText = "送信中...";
    
    try { 
        await addDoc(collection(db, "reports"), { 
            spotId: currentDetailSpotId, 
            category: cat, 
            text: txt, 
            created_at: serverTimestamp(), 
            resolved: false 
        }); 
        alert("報告を送信しました。ご協力ありがとうございます。"); 
        closeReportModal(); 
    } catch(e) { 
        alert("送信に失敗しました。"); 
    } finally { 
        btn.disabled = false; 
        btn.innerText = "送信"; 
    }
}

async function loadComments(spotId) {
    const list = document.getElementById('detail-comments-list'); 
    list.innerHTML = '<p class="text-sub">読込中...</p>';
    
    try { 
        const qSnap = await getDocs(collection(db, "spots", spotId, "comments")); 
        let cmts =[]; 
        qSnap.forEach(d => cmts.push(d.data())); 
        cmts.sort((a, b) => {
            const timeA = a.created_at ? a.created_at.toMillis() : Date.now();
            const timeB = b.created_at ? b.created_at.toMillis() : Date.now();
            return timeA - timeB; // 古い順にソート
        }); 
        
        list.innerHTML = cmts.length 
            ? cmts.map(c => `
                <div class="comment-item">
                    <div class="comment-header">
                        <span class="comment-name">${escapeHTML(c.name)||'名無しさん'}</span>
                        <span class="text-sub">${new Date(c.created_at?.toMillis()||Date.now()).toLocaleString('ja-JP')}</span>
                    </div>
                    <div class="comment-text">${escapeHTML(c.text)}</div>
                </div>`).join('') 
            : '<p class="text-sub">まだコメントはありません。</p>'; 
    } catch(err) { 
        console.error("コメントの読み込みに失敗:", err);
        list.innerHTML = '<p class="text-danger">読み込みに失敗しました</p>'; 
    }
}
