// アプリケーションの状態を一元管理
export let state = {
    allSpots: [],
    userLocation: null,
    userMarker: null,
    filterOpenOnly: false,
    previousView: 'view-map',
    currentDetailSpotId: null,
};

// 状態を更新するためのセッター関数
export function setAllSpots(spots) {
    state.allSpots = spots;
}
export function setUserLocation(location, marker) {
    state.userLocation = location;
    state.userMarker = marker;
}
export function setFilterOpenOnly(value) {
    state.filterOpenOnly = value;
}
export function setPreviousView(view) {
    state.previousView = view;
}
export function setCurrentDetailSpotId(id) {
    state.currentDetailSpotId = id;
}