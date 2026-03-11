// Wedding date - December 14, 2025 at 6:00 PM IST
// Using explicit date construction for maximum compatibility
const weddingDate = new Date(2025, 11, 14, 18, 0, 0).getTime(); // Month is 0-indexed, so 11 = December

// Live stream configuration
const liveStreamConfig = {
    // YouTube live stream URL
    youtubeUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&mute=0',
    // Flag to enable/disable stream (can be controlled remotely)
    streamEnabled: true
};

// Splash Screen Handler with Video and Audio
window.addEventListener('load', function() {
    const splashScreen = document.getElementById('splashScreen');
    const splashVideo = document.getElementById('splashVideo');
    const splashAudio = document.getElementById('splashAudio');
    const audioPrompt = document.getElementById('audioPrompt');
    
    if (!splashScreen || !splashVideo || !splashAudio) return;
    
    // Check if brand click flag is set
    const brandClicked = sessionStorage.getItem('showSplashOnLoad');
    
    // Check if this is first visit in this session
    const firstVisit = !sessionStorage.getItem('hasVisited');
    
    // Show splash on first visit OR brand click
    const showSplash = firstVisit || brandClicked;
    
    if (!showSplash) {
        splashScreen.style.display = 'none';
        return;
    }
    
    // Mark as visited and clear brand click flag
    sessionStorage.setItem('hasVisited', 'true');
    sessionStorage.removeItem('showSplashOnLoad');
    
    // Try to play audio immediately
    splashAudio.play().then(() => {
        // Audio started successfully - hide prompt
        if (audioPrompt) {
            audioPrompt.style.display = 'none';
        }
    }).catch(() => {
        // Audio was blocked - show prompt
        if (audioPrompt) {
            audioPrompt.style.display = 'block';
        }
    });
    
    // When video ends, fade out splash screen
    splashVideo.addEventListener('ended', function() {
        splashScreen.classList.add('fade-out');
        splashAudio.pause();
        
        // Trigger scroll check after splash hides
        setTimeout(() => {
            splashScreen.style.display = 'none';
            if (typeof fallbackStickyCheck === 'function') {
                fallbackStickyCheck();
            }
        }, 500);
    });
});

// Enable audio on user interaction
function enableAudio() {
    const splashAudio = document.getElementById('splashAudio');
    const audioPrompt = document.getElementById('audioPrompt');
    
    if (splashAudio && splashAudio.paused) {
        splashAudio.play().then(() => {
            if (audioPrompt) {
                audioPrompt.style.display = 'none';
            }
        }).catch(err => {
            console.log('Audio play failed:', err);
        });
    }
}

// Scroll to top function for logo
function scrollToTop(event) {
    event.preventDefault();
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}

// Handle brand link click to show splash
function handleBrandClick(event) {
    event.preventDefault();
    // Clear visited flag and set brand click flag
    sessionStorage.removeItem('hasVisited');
    sessionStorage.setItem('showSplashOnLoad', 'true');
    window.location.href = 'index.html';
}

// Handle Home link click to scroll without splash
function handleHomeClick(event) {
    const currentPage = window.location.pathname.split('/').pop();
    if (currentPage === 'index.html' || currentPage === '' || currentPage === '/') {
        event.preventDefault();
        const heroSection = document.querySelector('.hero-banner');
        if (heroSection) {
            heroSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }
}

// Simple Auto-Advancing Carousel with Background Color Extraction
let currentCardIndex = 0;
let carouselInterval;

function extractDominantColor(img) {
    try {
        const w = img.naturalWidth || img.width || 0;
        const h = img.naturalHeight || img.height || 0;
        if (!w || !h) return { r: 11, g: 15, b: 30 };

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const scale = 0.1;

        canvas.width = Math.max(1, Math.floor(w * scale));
        canvas.height = Math.max(1, Math.floor(h * scale));

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

        let r = 0, g = 0, b = 0;
        const pixels = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
        }
        return {
            r: Math.round(r / pixels),
            g: Math.round(g / pixels),
            b: Math.round(b / pixels)
        };
    } catch (e) {
        console.log('Color extraction failed:', e);
        return { r: 11, g: 15, b: 30 };
    }
}

function updateBackground(colorObj) {
    const hero = document.querySelector('.hero');
    if (!hero) return;

    const { r, g, b } = colorObj;

    const dark = [Math.max(0, r - 30), Math.max(0, g - 30), Math.max(0, b - 30)];
    const mid = [r, g, b];
    const lite = [Math.min(255, r + 60), Math.min(255, g + 60), Math.min(255, b + 60)];

    const gradient = `linear-gradient(135deg,
        rgb(${dark[0]},${dark[1]},${dark[2]}) 0%,
        rgb(${mid[0]},${mid[1]},${mid[2]}) 50%,
        rgb(${lite[0]},${lite[1]},${lite[2]}) 100%)`;

    // Apply to hero
    hero.style.background = gradient;

    // Expose as a CSS variable so other UI (like the top strip) can "bleed"
    const root = document.documentElement.style;
    root.setProperty('--hero-gradient', gradient);

    // Keep your existing contrast logic (optional but recommended):
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (luminance < 140) {
        root.setProperty('--nav-ink', 'rgba(255,255,255,.95)');
    } else {
        root.setProperty('--nav-ink', 'rgba(11,15,30,.95)');
    }

    // Accent for any other elements that need it
    const accent = `rgb(${mid[0]},${mid[1]},${mid[2]})`;
    root.setProperty('--accent', accent);
}

function setActiveCenterNav(index) {
    document.querySelectorAll('.center-nav-link').forEach((a, i) => {
        a.classList.toggle('is-active', i === index);
    });
}

function showCard(index) {
    const cards = document.querySelectorAll('.card');
    
    if (cards.length === 0) return;
    
    // Remove active class from all cards
    cards.forEach(card => card.classList.remove('active'));
    
    // Add active class to current card
    cards[index].classList.add('active');
    
    // Extract and update background color
    const img = cards[index].querySelector('img');
    if (img) {
        if (img.complete) {
            const color = extractDominantColor(img);
            updateBackground(color);
        } else {
            img.onload = () => {
                const color = extractDominantColor(img);
                updateBackground(color);
            };
        }
    }
    
    // Sync center nav active state (optional)
    setActiveCenterNav(index);
}

function nextCard() {
    const cards = document.querySelectorAll('.card');
    currentCardIndex = (currentCardIndex + 1) % cards.length;
    showCard(currentCardIndex);
}

function startCarousel() {
    // Show first card immediately
    showCard(0);
    
    // Auto-advance every 5 seconds
    carouselInterval = setInterval(nextCard, 5000);
}

// Initialize carousel
document.addEventListener('DOMContentLoaded', function() {
    const cards = document.querySelectorAll('.card');
    
    if (cards.length > 0) {
        // Ensure crossorigin is set (helps if images are changed dynamically later)
        cards.forEach(card => {
            const img = card.querySelector('img');
            if (img && !img.crossOrigin) {
                img.crossOrigin = 'anonymous';
            }
        });
        
        // Start carousel after a short delay
        setTimeout(startCarousel, 500);
    }
});



// Mobile menu functionality
document.addEventListener('DOMContentLoaded', function() {
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');

    if (hamburger && navMenu) {
        hamburger.addEventListener('click', function() {
            hamburger.classList.toggle('active');
            navMenu.classList.toggle('active');
        });

        // Close menu when clicking on a link
        document.querySelectorAll('.nav-link').forEach(n => n.addEventListener('click', () => {
            hamburger.classList.remove('active');
            navMenu.classList.remove('active');
        }));
    }

    // Initialize countdown timer
    updateCountdown();
    setInterval(updateCountdown, 1000);

    // Initialize navigation based on access level
    initializeNavigation();

    // Check access control for current page
    checkPageAccess();


});

// Countdown timer function
function updateCountdown() {
    const now = new Date().getTime();
    const distance = weddingDate - now;

    if (distance < 0) {
        // Wedding has started - show live stream
        showLiveStream();
        return;
    }

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);

    const daysElement = document.getElementById('days');
    const hoursElement = document.getElementById('hours');
    const minutesElement = document.getElementById('minutes');
    const secondsElement = document.getElementById('seconds');

    // Force update the countdown values and protect from translation
    if (daysElement) {
        daysElement.textContent = days;
        daysElement.setAttribute('data-original-text', days);
    }
    if (hoursElement) {
        hoursElement.textContent = hours;
        hoursElement.setAttribute('data-original-text', hours);
    }
    if (minutesElement) {
        minutesElement.textContent = minutes;
        minutesElement.setAttribute('data-original-text', minutes);
    }
    if (secondsElement) {
        secondsElement.textContent = seconds;
        secondsElement.setAttribute('data-original-text', seconds);
    }
}

// Live stream functions
function showLiveStream() {
    const countdownElement = document.getElementById('countdown');
    const liveStreamContainer = document.getElementById('liveStreamContainer');
    
    if (countdownElement && liveStreamContainer) {
        // Hide countdown
        countdownElement.style.display = 'none';
        
        // Show live stream container
        liveStreamContainer.style.display = 'block';
        
        // Initialize the stream
        initializeLiveStream();
    }
}

function initializeLiveStream() {
    const streamFrame = document.getElementById('liveStreamFrame');
    const streamFallback = document.getElementById('streamFallback');
    
    if (liveStreamConfig.streamEnabled && streamFrame) {
        streamFrame.src = liveStreamConfig.youtubeUrl;
        
        // Handle iframe load errors
        streamFrame.onerror = function() {
            showStreamFallback();
        };
    } else {
        showStreamFallback();
    }
}

function showStreamFallback() {
    const streamFallback = document.getElementById('streamFallback');
    const streamFrame = document.getElementById('liveStreamFrame');
    
    if (streamFallback && streamFrame) {
        streamFrame.style.display = 'none';
        streamFallback.style.display = 'block';
    }
}

function refreshStream() {
    const streamFrame = document.getElementById('liveStreamFrame');
    const streamFallback = document.getElementById('streamFallback');
    
    if (streamFrame && streamFallback) {
        // Hide fallback and show frame
        streamFallback.style.display = 'none';
        streamFrame.style.display = 'block';
        
        // Reload the stream
        initializeLiveStream();
    }
}

// Function to update stream URL (can be called to change the stream URL dynamically)
function updateStreamUrl(newUrl) {
    liveStreamConfig.youtubeUrl = newUrl;
    const streamFrame = document.getElementById('liveStreamFrame');
    if (streamFrame && streamFrame.style.display !== 'none') {
        streamFrame.src = newUrl;
    }
}

// Function to enable/disable stream
function toggleStream(enabled) {
    liveStreamConfig.streamEnabled = enabled;
    if (!enabled) {
        showStreamFallback();
    } else {
        initializeLiveStream();
    }
}

// Access control functions
function getCurrentPage() {
    const path = window.location.pathname;
    const filename = path.split('/').pop() || 'index.html';
    
    if (filename === 'index.html' || filename === '') return 'home';
    if (filename === 'event-details.html') return 'event-details';
    if (filename === 'rsvp.html') return 'rsvp';
    if (filename === 'location.html') return 'location';
    
    return 'home';
}

function getUserAccess() {
    return localStorage.getItem('userAccess') || null;
}

function setUserAccess(accessLevel) {
    localStorage.setItem('userAccess', accessLevel);
}

function checkPageAccess() {
    // OLD FUNCTION - DISABLED FOR SECURITY
    // This has been replaced by secure-auth.js
    // The new system handles page access control automatically
    return true;
}

function showAccessModal() {
    // Create modal if it doesn't exist
    let modal = document.getElementById('accessModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'accessModal';
        modal.className = 'access-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h2>Access Required</h2>
                <p>Please enter your access code to view this page:</p>
                <input type="password" id="accessCode" placeholder="Enter access code">
                <button onclick="validateAccess()">Submit</button>
                <p style="margin-top: 1rem; font-size: 0.9rem; color: #666;">
                    Don't have an access code? Contact the couple for access.
                </p>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    modal.style.display = 'block';
    
    // Focus on input
    setTimeout(() => {
        const input = document.getElementById('accessCode');
        if (input) input.focus();
    }, 100);

    // Handle Enter key
    document.getElementById('accessCode').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            validateAccess();
        }
    });
}

function validateAccess() {
    // OLD FUNCTION - DISABLED FOR SECURITY
    // This has been replaced by secure-auth.js
    // The new system handles authentication automatically
    console.log('validateAccess called - redirecting to new authentication system');
    
    // Close the old modal if it exists
    const oldModal = document.getElementById('accessModal');
    if (oldModal) {
        oldModal.style.display = 'none';
    }
    
    // Show the new authentication modal
    if (typeof pageAccess !== 'undefined' && pageAccess.showAuthModal) {
        pageAccess.showAuthModal();
    } else {
        // Fallback if pageAccess is not loaded yet
        setTimeout(() => {
            if (typeof pageAccess !== 'undefined' && pageAccess.showAuthModal) {
                pageAccess.showAuthModal();
            }
        }, 100);
    }
}

// Navigation initialization - now handled by secure-auth.js
function initializeNavigation() {
    // Navigation is now handled by the secure authentication system
    // This function is kept for compatibility but does nothing
    console.log('Navigation initialization handled by secure-auth.js');
}

// Navigation update - now handled by secure-auth.js
function updateNavigation(accessLevel) {
    // Navigation updates are now handled by the secure authentication system
    // This function is kept for compatibility but does nothing
    console.log('Navigation updates handled by secure-auth.js');
}

// Navbar scroll state - makes navbar solid after scrolling past hero
(function navbarScrollState() {
    const navbar = document.querySelector('.navbar');
    const hero = document.querySelector('.hero');
    if (!navbar || !hero) return;

    const applyState = () => {
        const navH = navbar.offsetHeight || 72;
        const heroBottom = hero.getBoundingClientRect().bottom;
        // If we've scrolled past the hero edge, go solid; else stay transparent
        if (heroBottom <= navH + 20) {
            navbar.classList.add('solid');
        } else {
            navbar.classList.remove('solid');
        }
    };

    applyState();
    window.addEventListener('scroll', applyState, { passive: true });
    window.addEventListener('resize', applyState);
})();

// Respect reduced motion (optional but nice)
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const splash = document.getElementById('splashScreen');
    if (splash) splash.style.animation = 'none';
}

// Hero section snap disabled - normal scrolling behavior










function handleFamilyClick(event) {
    console.log('handleFamilyClick called, pathname:', window.location.pathname);
    if (window.location.pathname.includes('family.html')) {
        event.preventDefault();
        console.log('Scrolling to top');
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        return false;
    }
}
