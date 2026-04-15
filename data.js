import { db, storage } from './firebase.js';
import { collection, getDocs, addDoc, serverTimestamp, query, where } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { compressImage, getPinColor, escapeHTML } from './utils.js';
import { createCustomIcon } from './map.js';

// Firestoreから承認済みの全スポットを取得
export async function fetchSpots() {
    const spots = [];
    const q = query(collection(db, "spots"), where("approved", "==", true));
    const snap = await getDocs(q);

    snap.forEach(doc => {
        const spotData = doc.data();
        spotData.id = doc.id;

        if (spotData.lat && spotData.lng) {
            const marker = L.marker([spotData.lat, spotData.lng], { icon: createCustomIcon(getPinColor(spotData.features)) });
            // ポップアップ内のボタンもイベント委譲で制御
            marker.bindPopup(`
                <div class="custom-popup">
                    <div class="popup-placename"><span>${escapeHTML(spotData.placename)}</span></div>
                    <div class="popup-title">${escapeHTML(spotData.name)}</div>
                    <button class="popup-btn spot-card-link" data-action="showDetail" data-id="${spotData.id}">詳細を見る</button>
                </div>
            `);
            spotData.marker = marker;
            marker.addTo(mainMap); // mainMapはmap.jsから直接参照
            spots.push(spotData);
        }
    });
    return spots;
}

// 特定のスポットのコメントを取得
export async function fetchComments(spotId) {
    const comments = [];
    const qSnap = await getDocs(collection(db, "spots", spotId, "comments"));
    qSnap.forEach(d => comments.push(d.data()));

    comments.sort((a, b) => {
        const timeA = a.created_at ? a.created_at.toMillis() : Date.now();
        const timeB = b.created_at ? b.created_at.toMillis() : Date.now();
        return timeA - timeB; // 古い順にソート
    });
    return comments;
}

// 新規スポットの申請を送信
export async function submitSpot(formData) {
    let imageUrl = null;
    if (formData.imageFile) {
        try {
            const compressedBlob = await compressImage(formData.imageFile, 1024, 0.8);
            const randomStr = Math.random().toString(36).substring(2, 8);
            const storageRef = ref(storage, `spots/${Date.now()}_${randomStr}.jpg`);
            await uploadBytes(storageRef, compressedBlob);
            imageUrl = await getDownloadURL(storageRef);
        } catch (err) {
            console.error("画像アップロードエラー:", err);
            alert("画像のアップロードに失敗しました。画像なしで登録します。");
        }
    }

    await addDoc(collection(db, "spots"), {
        name: formData.name,
        placename: formData.placename,
        floor: formData.floor,
        available_hours: formData.hours,
        features: formData.features,
        closed_days: formData.closed_days,
        lat: formData.lat,
        lng: formData.lng,
        imageUrl,
        approved: false,
        created_at: serverTimestamp()
    });
}

// 問題の報告を送信
export async function submitReport(reportData) {
    await addDoc(collection(db, "reports"), {
        spotId: reportData.spotId,
        category: reportData.category,
        text: reportData.text,
        created_at: serverTimestamp(),
        resolved: false
    });
}

// コメントを送信
export async function submitComment(commentData) {
    await addDoc(collection(db, "spots", commentData.spotId, "comments"), {
        name: commentData.name,
        text: commentData.text,
        created_at: serverTimestamp()
    });
}