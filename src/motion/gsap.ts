/**
 * One place that registers GSAP and its plugins so every screen shares the same
 * defaults. ScrollTrigger drives all scroll-linked motion; Lenis (smooth.ts)
 * supplies the inertial scrolling and feeds ScrollTrigger on every frame.
 */
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { Flip } from 'gsap/Flip';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { CustomEase } from 'gsap/CustomEase';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger, SplitText, Flip, DrawSVGPlugin, CustomEase, useGSAP);
CustomEase.create('igh', '0.16, 1, 0.3, 1');
gsap.defaults({ ease: 'igh', duration: 0.8 });
ScrollTrigger.config({ ignoreMobileResize: true });

export { gsap, ScrollTrigger, SplitText, Flip, useGSAP };

/** True when the OS asks for less motion. */
export const osReducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

/** True on devices with a real hover pointer (mouse, trackpad). */
export const canHover = () => {
  try {
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  } catch {
    return false;
  }
};
