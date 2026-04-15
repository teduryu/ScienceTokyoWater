export function escapeHTML(str) { 
    return typeof str === 'string' 
        ? str.replace(/[&<>'"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[m])) 
        : ''; 
}

export function getDistance(lat1, lon1, lat2, lon2) { 
    const R = 6371e3; 
    const p1 = lat1 * Math.PI/180; 
    const p2 = lat2 * Math.PI/180; 
    const dp = (lat2-lat1) * Math.PI/180; 
    const dl = (lon2-lon1) * Math.PI/180; 
    const a = Math.sin(dp/2) * Math.sin(dp/2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2) * Math.sin(dl/2); 
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
}

export function formatDistance(meters) { 
    return meters < 1000 ? `${Math.round(meters)}m` : `${(meters / 1000).toFixed(1)}km`; 
}

export function isOpen(spot, currentDate = new Date()) {
    // 依存性注入(DI)化: currentDateを外部から渡せるようにしてテスト容易性を向上
    const hs = spot.available_hours ?? "24時間営業"; // モダンな書き方(??)の適用
    const cd = currentDate.getDay();
    if ((spot.closed_days ||[]).includes(cd)) return false;
    if (hs.includes("24時間") || hs === "不明") return true;
    
    try {
        const ct = currentDate.getHours() * 60 + currentDate.getMinutes();
        const p = hs.replace(/[～~]/g, '-').split('-');
        if (p.length < 2) return true;
        
        const s = p[0].trim().split(':').map(Number);
        const e = p[1].trim().split(':').map(Number);
        const startMins = s[0] * 60 + s[1];
        const endMins = e[0] * 60 + e[1];
        
        if (startMins <= endMins) {
            return ct >= startMins && ct <= endMins;
        } else {
            return ct >= startMins || ct <= endMins;
        }
    } catch { 
        return true; 
    }
}

export function getClosedDaysText(c) { 
    return (!c || c.length === 0) 
        ? "" 
        : `<span class="text-danger" style="margin-left:8px;">休: ${c.map(d => ["日","月","火","水","木","金","土","祝"][d]).join(',')}</span>`; 
}

export function getPinColor(f) { 
    if (!f) return "var(--pin-default)"; 
    if (f.includes("お湯")) return "var(--pin-hot)"; 
    if (f.includes("給水機")) return "var(--pin-machine)"; 
    if (f.includes("蛇口")) return "var(--pin-tap)"; 
    return "var(--pin-default)"; 
}

export function compressImage(file, maxWidth = 1024, quality = 0.8) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader(); 
        reader.readAsDataURL(file);
        reader.onload = event => {
            const img = new Image(); 
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width; 
                let height = img.height;
                if (width > maxWidth) { 
                    height = Math.round((height * maxWidth) / width); 
                    width = maxWidth; 
                }
                canvas.width = width; 
                canvas.height = height;
                const ctx = canvas.getContext('2d'); 
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob(blob => resolve(blob), 'image/jpeg', quality);
            }; 
            img.onerror = error => reject(error);
        }; 
        reader.onerror = error => reject(error);
    });
}