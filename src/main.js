import { state } from './state.js';
import { initClock, checkUrlParams, copyShareLink, render } from './ui.js';
import { handleRegister, handleLogin, handleResetPassword, handleSaveUserName, openUserNameModal, closeUserNameModal, deleteAccount, toggleRegisterView, toggleResetView } from './auth.js';
import { 
    setTheme, 
    setCustomWallpaper, 
    toggleDeleteCircleMode, 
    openColorWheelModal, 
    closeColorWheelModal, 
    changeColorMode, 
    updatePreviewBox, 
    saveCustomColorCircle 
} from './wallpaper.js';
import { handleSaveCard, clearAllCards, handleDragStart, handleDragMove, handleDragEnd, openCardModal, closeCardModal, closeViewModal } from './cards.js';
import { subscribeToRealtimeCards } from './cards.js';
import { switchToBoard, switchToGateway } from './ui.js';
import { loadUserWallpaper } from './wallpaper.js';

const App = {
    init() {
        this.bindEvents();
        initClock();

        // A share link (?board=...) always takes priority over a saved session,
        // so the owner can test their own link in the same browser
        const boardParam = new URLSearchParams(window.location.search).get("board");
        if (boardParam) {
            checkUrlParams();
            return;
        }

        // No share link: restore the saved session (persistent login)
        const savedUser = localStorage.getItem("machikoto_current_user");
        if (savedUser) {
            try {
                const userData = JSON.parse(savedUser);
                state.currentUser = userData;
                state.activeBoardUserId = userData.docId;
                state.isManager = true;
                state.isReadOnly = false;
                subscribeToRealtimeCards(userData.docId);
                render();
                switchToBoard();
                loadUserWallpaper(userData.docId);
                return;
            } catch (e) {
                console.warn("Persistent login parse error:", e);
                localStorage.removeItem("machikoto_current_user");
            }
        }

        checkUrlParams();
    },

    bindEvents() {
        const corkboard = document.getElementById("corkboard");
        if (!corkboard) return;

        corkboard.addEventListener("mousedown", (e) => handleDragStart(e));
        document.addEventListener("mousemove", (e) => handleDragMove(e));
        document.addEventListener("mouseup", () => handleDragEnd());

        corkboard.addEventListener("touchstart", (e) => handleDragStart(e), { passive: false });
        document.addEventListener("touchmove", (e) => handleDragMove(e), { passive: false });
        document.addEventListener("touchend", () => handleDragEnd());
    },

    // Auth methods
    handleRegister,
    handleLogin,
    handleResetPassword,
    handleSaveUserName,
    openUserNameModal,
    closeUserNameModal,
    deleteAccount,
    toggleRegisterView,
    toggleResetView,

    // Wallpaper & Color methods
    setTheme,
    setCustomWallpaper,
    toggleDeleteCircleMode,
    openColorWheelModal,
    closeColorWheelModal,
    changeColorMode,
    updatePreviewBox,
    saveCustomColorCircle,

    // Cards methods
    handleSaveCard,
    clearAllCards,
    openCardModal,
    closeCardModal,
    closeViewModal,

    // UI navigation methods
    copyShareLink,
    switchToGateway
};

// Expose globally for HTML elements
window.App = App;

window.addEventListener("DOMContentLoaded", () => {
    App.init();
});
