import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class AudioService {
  private audioContext: AudioContext | null = null;
  private enabled = true;

  constructor() {
    // Initialize AudioContext (required for Web Audio API)
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (e) {
      console.warn('Web Audio API not supported, audio notifications disabled');
    }
  }

  /**
   * Play a short ping sound notification
   * @param frequency - Frequency in Hz (default: 800)
   * @param duration - Duration in milliseconds (default: 100)
   */
  playPing(frequency: number = 800, duration: number = 100): void {
    if (!this.enabled || !this.audioContext) return;

    try {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';

      // Fade out to avoid clicking sound
      gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration / 1000);

      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + duration / 1000);
    } catch (e) {
      console.warn('Failed to play audio notification:', e);
    }
  }

  /**
   * Play a notification for order changes (slightly different tone)
   * @deprecated Use playRestaurantOrderChange() or playCustomerOrderChange() instead
   */
  playOrderChange(): void {
    this.playPing(600, 150);
  }

  /**
   * Play a notification for status changes (higher tone)
   * @deprecated Use playRestaurantStatusChange() or playCustomerStatusChange() instead
   */
  playStatusChange(): void {
    this.playPing(1000, 120);
  }

  /**
   * Play a notification for restaurant backend - new order or order changes
   * Uses a lower, more urgent double beep (like a kitchen bell)
   */
  playRestaurantOrderChange(): void {
    if (!this.enabled || !this.audioContext) return;

    try {
      const now = this.audioContext.currentTime;
      
      // First beep
      const osc1 = this.audioContext.createOscillator();
      const gain1 = this.audioContext.createGain();
      osc1.connect(gain1);
      gain1.connect(this.audioContext.destination);
      osc1.frequency.value = 500;
      osc1.type = 'sine';
      gain1.gain.setValueAtTime(0.3, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc1.start(now);
      osc1.stop(now + 0.1);
      
      // Second beep after short delay
      const osc2 = this.audioContext.createOscillator();
      const gain2 = this.audioContext.createGain();
      osc2.connect(gain2);
      gain2.connect(this.audioContext.destination);
      osc2.frequency.value = 500;
      osc2.type = 'sine';
      gain2.gain.setValueAtTime(0.3, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.25);
    } catch (e) {
      console.warn('Failed to play restaurant order change sound:', e);
    }
  }

  /**
   * Play a notification for restaurant backend - status changes
   * Uses a medium tone single beep
   */
  playRestaurantStatusChange(): void {
    this.playPing(700, 120);
  }

  /**
   * Play a notification for customer frontend - order changes
   * Uses a higher, gentler single chime
   */
  playCustomerOrderChange(): void {
    this.playPing(800, 180);
  }

  /**
   * Play a notification for customer frontend - status changes
   * Uses a pleasant higher tone chime
   */
  playCustomerStatusChange(): void {
    this.playPing(1000, 150);
  }

  /**
   * Enable or disable audio notifications
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if audio is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}
