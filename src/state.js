export const state = {
    currentUser: null,
    activeBoardUserId: null,
    cards: [],
    managers: JSON.parse(localStorage.getItem("machikoto_managers") || "{}"),
    isManager: false,
    isReadOnly: false,
    draggedCardId: null,
    dragOffset: { x: 0, y: 0 },
    unsubscribeCards: null,
    currentTheme: 'theme-pastel-pink',
    customWallpapers: [],
    isDeleteCircleMode: false
};

export function saveLocalManagers() {
    try {
        localStorage.setItem("machikoto_managers", JSON.stringify(state.managers));
    } catch (e) {
        console.warn("LocalStorage save warning:", e);
    }
}