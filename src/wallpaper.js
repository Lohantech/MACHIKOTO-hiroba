import { state } from './state.js';
import { db } from './firebase.js';
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const MAX_WALLPAPERS = 10;
const DEFAULT_THEME = 'theme-pastel-pink';
const IMGBB_UPLOAD_URL = "https://api.imgbb.com/1/upload?key=c43558f4d66062400d67dd841129fcec";

// Selected colors storage (color wheel modal)
let selectedColor1 = '#ffffff';
let selectedColor2 = '#ffd3e2';
let selectedColor3 = '#bce9ff';

/* ========================================================
   BACKGROUND APPLY / SAVE
   - apply* functions only change what is displayed
   - saveActiveBackground persists the currently active
     background so the read-only share link can display it
   ======================================================== */

// Visually applies a built-in theme class (no saving)
function applyTheme(themeName) {
    state.currentTheme = themeName;
    const container = document.getElementById("smartphoneContainer");
    if (container) {
        container.style.background = '';
        container.className = `smartphone-container ${themeName}`;
    }
}

// Called by the theme buttons: applies the theme AND saves it as the active background
export function setTheme(themeName) {
    applyTheme(themeName);
    saveActiveBackground(themeName);
}

// Visually applies an image URL, a data URI, or a CSS color/gradient (no saving)
export function setCustomThemeUrl(urlOrGradient) {
    const container = document.getElementById("smartphoneContainer");
    if (!container) return;

    if (urlOrGradient.startsWith("http") || urlOrGradient.startsWith("data:")) {
        container.style.background = `url('${urlOrGradient}')`;
        container.style.backgroundSize = 'cover';
        container.style.backgroundPosition = 'center';
    } else {
        container.style.background = urlOrGradient;
    }
}

// Applies any saved background value: built-in theme name OR image / color / gradient
function applyActiveBackground(value) {
    if (typeof value === "string" && value.startsWith("theme-")) {
        applyTheme(value);
    } else if (value) {
        setCustomThemeUrl(value);
    }
}

// Persists the active background (only the board owner can write it).
// Viewers of a share link read this value back in loadUserWallpaper().
export async function saveActiveBackground(value) {
    if (!state.isManager || !state.activeBoardUserId) return;

    try {
        if (db) {
            await updateDoc(doc(db, "managers", state.activeBoardUserId), { activeBackground: value });
        } else {
            localStorage.setItem(`machikoto_active_bg_${state.activeBoardUserId}`, value);
        }
    } catch (e) {
        console.warn("Failed to save active background:", e);
    }
}

// Clears everything related to the previous user's wallpaper (background, saved circles, theme).
// Must run on logout and before loading another account, so backgrounds are never shared between users.
export function resetWallpaper() {
    state.customWallpapers = [];
    state.isDeleteCircleMode = false;

    const deleteBtn = document.getElementById("toggleDeleteBtn");
    if (deleteBtn) deleteBtn.classList.remove("active");

    // applyTheme (not setTheme) so the default is never written to the database
    applyTheme(DEFAULT_THEME);
    renderCustomWallpaperCircles();
}

/* ========================================================
   CUSTOM WALLPAPER CIRCLES
   ======================================================== */

export function toggleDeleteCircleMode() {
    state.isDeleteCircleMode = !state.isDeleteCircleMode;
    const btn = document.getElementById("toggleDeleteBtn");
    if (btn) {
        btn.classList.toggle("active", state.isDeleteCircleMode);
    }
    renderCustomWallpaperCircles();
}

export function renderCustomWallpaperCircles() {
    const container = document.getElementById("customThemeContainer");
    if (!container) return;
    container.innerHTML = "";

    state.customWallpapers.forEach((bgValue, index) => {
        const circle = document.createElement("div");
        circle.className = "custom-theme-circle";

        if (bgValue.startsWith("http") || bgValue.startsWith("data:")) {
            circle.style.backgroundImage = `url('${bgValue}')`;
        } else {
            circle.style.background = bgValue;
        }

        circle.title = `カスタム背景 ${index + 1}`;

        circle.onclick = () => {
            if (!state.isDeleteCircleMode) {
                setCustomThemeUrl(bgValue);
                saveActiveBackground(bgValue);
            }
        };

        if (state.isDeleteCircleMode) {
            const deleteBtn = document.createElement("button");
            deleteBtn.className = "circle-delete-btn";
            deleteBtn.textContent = "✕";
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                removeCustomWallpaper(index);
            };
            circle.appendChild(deleteBtn);
        }

        container.appendChild(circle);
    });
}

export async function removeCustomWallpaper(index) {
    state.customWallpapers.splice(index, 1);
    renderCustomWallpaperCircles();
    await saveCustomWallpapers();
}

export async function saveCustomWallpapers() {
    if (!state.activeBoardUserId) return;

    if (db) {
        try {
            const managerDocRef = doc(db, "managers", state.activeBoardUserId);
            await updateDoc(managerDocRef, { customWallpapers: state.customWallpapers });
        } catch (e) {
            console.warn("Failed to save custom wallpapers to Firestore:", e);
        }
    } else {
        localStorage.setItem(`machikoto_wallpapers_${state.activeBoardUserId}`, JSON.stringify(state.customWallpapers));
    }
}

/* ========================================================
   LOADING (owner AND read-only share link)
   ======================================================== */

export async function loadUserWallpaper(userId) {
    if (!userId) return;

    // Start from a clean default so nothing from the previous user leaks into this board
    resetWallpaper();

    if (db) {
        try {
            const managerDoc = await getDoc(doc(db, "managers", userId));

            // Ignore a late response if another board was opened in the meantime
            if (state.activeBoardUserId !== userId) return;

            if (managerDoc.exists()) {
                const data = managerDoc.data();
                state.customWallpapers = data.customWallpapers || [];

                if (data.activeBackground) {
                    // Current background: theme, color, gradient or image
                    applyActiveBackground(data.activeBackground);
                } else if (data.wallpaperUrl) {
                    // Legacy accounts: only the last uploaded image was stored
                    setCustomThemeUrl(data.wallpaperUrl);
                }
            }
        } catch (e) {
            console.warn("Wallpaper load warning:", e);
        }
    } else {
        const savedList = localStorage.getItem(`machikoto_wallpapers_${userId}`);
        if (savedList) {
            state.customWallpapers = JSON.parse(savedList);
        }

        const savedBackground = localStorage.getItem(`machikoto_active_bg_${userId}`)
            || localStorage.getItem(`machikoto_wallpaper_${userId}`);
        if (savedBackground) {
            applyActiveBackground(savedBackground);
        }
    }

    renderCustomWallpaperCircles();
}

/* ========================================================
   IMAGE WALLPAPER UPLOAD
   ======================================================== */

export async function setCustomWallpaper() {
    const fileInput = document.getElementById("wallFile");
    if (!fileInput || !fileInput.files[0]) return;

    if (state.customWallpapers.length >= MAX_WALLPAPERS) {
        alert("⚠️ 保存上限（最大10個）に達しています。\n新しい背景を追加するには、不要な円を削除してください。");
        fileInput.value = "";
        return;
    }

    const imageFile = fileInput.files[0];
    if (!state.activeBoardUserId) return;

    try {
        const formData = new FormData();
        formData.append("image", imageFile);

        const response = await fetch(IMGBB_UPLOAD_URL, {
            method: "POST",
            body: formData
        });
        const result = await response.json();

        if (result && result.success && result.data && result.data.url) {
            const url = result.data.url;
            setCustomThemeUrl(url);

            state.customWallpapers.push(url);
            renderCustomWallpaperCircles();

            if (db) {
                const managerDocRef = doc(db, "managers", state.activeBoardUserId);
                await updateDoc(managerDocRef, {
                    wallpaperUrl: url,          // kept for backward compatibility
                    activeBackground: url,      // read by the share link
                    customWallpapers: state.customWallpapers
                });
            } else {
                localStorage.setItem(`machikoto_wallpaper_${state.activeBoardUserId}`, url);
                localStorage.setItem(`machikoto_active_bg_${state.activeBoardUserId}`, url);
                await saveCustomWallpapers();
            }

            fileInput.value = "";
        } else {
            alert("画像のアップロードに失敗しました。");
        }
    } catch (err) {
        console.error("Wallpaper upload error:", err);
        alert("壁紙アップロード中にエラーが発生しました。");
    }
}

/* ========================================================
   COLOR WHEEL & GRADIENT LOGIC (real-time, up to 3 colors)
   ======================================================== */

export function openColorWheelModal() {
    if (state.customWallpapers.length >= MAX_WALLPAPERS) {
        alert("⚠️ 保存上限（最大10個）に達しています。\n新しい背景を追加するには、不要な円を削除してください。");
        return;
    }

    const modal = document.getElementById("colorPickerModal");
    if (modal) {
        modal.showModal();
        drawColorWheel("colorWheel1", (color) => {
            selectedColor1 = color;
            updatePreviewBox();
        });
        drawColorWheel("colorWheel2", (color) => {
            selectedColor2 = color;
            updatePreviewBox();
        });
        drawColorWheel("colorWheel3", (color) => {
            selectedColor3 = color;
            updatePreviewBox();
        });
        updatePreviewBox();
    }
}

export function closeColorWheelModal() {
    const modal = document.getElementById("colorPickerModal");
    if (modal) modal.close();
}

export function changeColorMode(mode) {
    const group2 = document.getElementById("wheelGroup2");
    const group3 = document.getElementById("wheelGroup3");
    const angleGroup = document.getElementById("angleGroup");

    if (group2) group2.style.display = (mode === 'gradient2' || mode === 'gradient3') ? "block" : "none";
    if (group3) group3.style.display = (mode === 'gradient3') ? "block" : "none";
    if (angleGroup) angleGroup.style.display = (mode === 'gradient2' || mode === 'gradient3') ? "block" : "none";

    updatePreviewBox();
}

// Draws a color wheel and wires Pointer Events for smooth desktop & mobile interaction
function drawColorWheel(canvasId, onColorSelect) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const radius = canvas.width / 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let angle = 0; angle < 360; angle += 1) {
        const startAngle = (angle - 2) * Math.PI / 180;
        const endAngle = (angle + 2) * Math.PI / 180;
        ctx.beginPath();
        ctx.moveTo(radius, radius);
        ctx.arc(radius, radius, radius - 2, startAngle, endAngle);
        ctx.closePath();

        const gradient = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius - 2);
        gradient.addColorStop(0, 'white');
        gradient.addColorStop(1, `hsl(${angle}, 100%, 50%)`);
        ctx.fillStyle = gradient;
        ctx.fill();
    }

    const pickColor = (e) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        if (x >= 0 && x <= canvas.width && y >= 0 && y <= canvas.height) {
            const pixel = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
            // Ignore transparent pixels (outside the wheel)
            if (pixel[3] > 0) {
                const hex = `#${((1 << 24) + (pixel[0] << 16) + (pixel[1] << 8) + pixel[2]).toString(16).slice(1)}`;
                onColorSelect(hex);
            }
        }
    };

    let isPointerDown = false;

    canvas.onpointerdown = (e) => {
        isPointerDown = true;
        canvas.setPointerCapture(e.pointerId);
        pickColor(e);
    };

    canvas.onpointermove = (e) => {
        if (isPointerDown) {
            pickColor(e);
        }
    };

    canvas.onpointerup = (e) => {
        if (isPointerDown) {
            isPointerDown = false;
            canvas.releasePointerCapture(e.pointerId);
        }
    };
}

function hexToRgba(hex, opacity) {
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const num = parseInt(c, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export function updatePreviewBox() {
    const preview = document.getElementById("colorPreviewBox");
    const mode = document.querySelector('input[name="colorMode"]:checked')?.value || 'single';
    const opacity = parseFloat(document.getElementById("colorOpacity")?.value || 1);

    if (!preview) return;

    const rgba1 = hexToRgba(selectedColor1, opacity);

    if (mode === 'gradient3') {
        const rgba2 = hexToRgba(selectedColor2, opacity);
        const rgba3 = hexToRgba(selectedColor3, opacity);
        const angle = document.getElementById("gradientAngle")?.value || "135deg";
        preview.style.background = `linear-gradient(${angle}, ${rgba1}, ${rgba2}, ${rgba3})`;
    } else if (mode === 'gradient2') {
        const rgba2 = hexToRgba(selectedColor2, opacity);
        const angle = document.getElementById("gradientAngle")?.value || "135deg";
        preview.style.background = `linear-gradient(${angle}, ${rgba1}, ${rgba2})`;
    } else {
        preview.style.background = rgba1;
    }
}

export async function saveCustomColorCircle() {
    if (state.customWallpapers.length >= MAX_WALLPAPERS) {
        alert("⚠️ 保存上限（最大10個）に達しています。\n新しい背景を追加するには、不要な円を削除してください。");
        return;
    }

    const previewBox = document.getElementById("colorPreviewBox");
    if (!previewBox) return;

    const finalBackground = previewBox.style.background;

    // Apply it, store it as the active background (share link), then save it as a circle
    setCustomThemeUrl(finalBackground);
    saveActiveBackground(finalBackground);
    state.customWallpapers.push(finalBackground);
    renderCustomWallpaperCircles();
    await saveCustomWallpapers();

    closeColorWheelModal();
}
