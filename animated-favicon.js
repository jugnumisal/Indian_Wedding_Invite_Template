// Animated favicon for browser tab title
class AnimatedFavicon {
    constructor() {
        this.frames = ['🌍', '🌎', '🌏']; // Earth emoji rotation
        this.currentFrame = 0;
        this.isAnimating = false;
    }

    start() {
        if (this.isAnimating) return;
        this.isAnimating = true;
        this.animate();
    }

    stop() {
        this.isAnimating = false;
    }

    animate() {
        if (!this.isAnimating) return;
        
        // Update title with rotating earth emoji after #LoremIpsum
        const baseTitle = '#LoremIpsum';
        // Force update to clear any cached titles
        document.title = '';
        setTimeout(() => {
            document.title = `${baseTitle} ${this.frames[this.currentFrame]}`;
        }, 10);
        
        this.currentFrame = (this.currentFrame + 1) % this.frames.length;
        
        setTimeout(() => this.animate(), 800); // Change every 800ms
    }
}

// Start animation when page loads
document.addEventListener('DOMContentLoaded', () => {
    const animatedFavicon = new AnimatedFavicon();
    animatedFavicon.start();
    
    // Pause animation when tab is not visible (performance optimization)
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            animatedFavicon.stop();
        } else {
            animatedFavicon.start();
        }
    });
});