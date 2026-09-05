import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import ReelFeedContainer from "@/features/shop/reels/components/ReelFeedContainer";
import ReelMedia from "@/features/shop/reels/components/ReelMedia";
import ReelOverlay, { formatReelPrice } from "@/features/shop/reels/components/ReelOverlay";
import ReelsCategoryNav from "@/features/shop/reels/components/ReelsCategoryNav";
import ReelItem from "@/features/shop/reels/components/ReelItem";
import ReelsMenuView from "@/features/shop/reels/components/ReelsMenuView";
import {
  useReelsMediaLifecycle,
  ReelsMediaLifecycleManager,
} from "@/features/shop/reels/hooks/useReelsMediaLifecycle";
import type { Category, MenuItem } from "@/types/types";

const mockCategory1: Category = {
  documentId: "cat-burgers",
  name: "Burgers",
  menu_items: null,
  combos: null,
};

const mockCategory2: Category = {
  documentId: "cat-drinks",
  name: "Bebidas",
  menu_items: null,
  combos: null,
};

const mockItemWithVideo: MenuItem = {
  documentId: "item-1",
  name: "Doble Smash Bacon",
  price: 14500,
  description: "Doble medallón smash con cheddar fundido y panceta",
  image: "https://cdn.komanda.app/images/smash.jpg",
  videoUrl: "https://cdn.komanda.app/videos/smash.mp4",
  category: mockCategory1,
  combos: null,
};

const mockItemWithoutVideo: MenuItem = {
  documentId: "item-2",
  name: "Papas Rústicas con Cheddar",
  price: 7800,
  description: "Papas cortadas a mano con queso cheddar fundido",
  image: "https://cdn.komanda.app/images/papas.jpg",
  videoUrl: null,
  category: mockCategory1,
  combos: null,
};

describe("Reels Immersive Feed Components (Epic 2)", () => {
  describe("ReelFeedContainer (Story 2.1)", () => {
    it("renders with 100dvh height and scroll-snap-type: y mandatory for mobile", () => {
      const html = renderToStaticMarkup(
        React.createElement(
          ReelFeedContainer,
          null,
          React.createElement("div", null, "Child 1")
        )
      );

      expect(html).toContain('data-testid="reel-feed-container"');
      expect(html).toContain("h-[100dvh]");
      expect(html).toContain("overflow-y-scroll");
      expect(html).toContain("scroll-snap-type:y mandatory");
    });

    it("applies max-w-md responsive framing on desktop screens", () => {
      const html = renderToStaticMarkup(
        React.createElement(
          ReelFeedContainer,
          null,
          React.createElement("div", null, "Child 1")
        )
      );

      expect(html).toContain("md:max-w-md");
      expect(html).toContain("md:h-[92vh]");
    });
  });

  describe("ReelMedia (Story 2.2)", () => {
    it("renders muted, playsInline, loop video when videoUrl is present", () => {
      const html = renderToStaticMarkup(
        React.createElement(ReelMedia, {
          image: mockItemWithVideo.image,
          videoUrl: mockItemWithVideo.videoUrl,
          alt: mockItemWithVideo.name,
        })
      );

      expect(html).toContain('data-testid="reel-video"');
      expect(html).toContain('src="https://cdn.komanda.app/videos/smash.mp4"');
      expect(html).toContain('poster="https://cdn.komanda.app/images/smash.jpg"');
      expect(html).toContain("muted");
      expect(html.toLowerCase()).toContain("playsinline");
      expect(html).toContain("loop");
      expect(html).not.toContain('data-testid="reel-blur-backdrop"');
    });

    it("renders blur backdrop with 24px blur and sharp object-contain image when videoUrl is absent", () => {
      const html = renderToStaticMarkup(
        React.createElement(ReelMedia, {
          image: mockItemWithoutVideo.image,
          videoUrl: mockItemWithoutVideo.videoUrl,
          alt: mockItemWithoutVideo.name,
        })
      );

      expect(html).toContain('data-testid="reel-blur-backdrop"');
      expect(html).not.toContain('data-testid="reel-video"');
      expect(html).toContain("blur(24px)");
      expect(html).toContain("brightness(0.45)");
      expect(html).toContain("object-contain");
      expect(html).toContain(`alt="${mockItemWithoutVideo.name}"`);
    });
  });

  describe("ReelOverlay (Story 2.3)", () => {
    it("enforces strict DOM order: Price precedes Title, Title precedes Description", () => {
      const html = renderToStaticMarkup(
        React.createElement(ReelOverlay, {
          price: mockItemWithVideo.price,
          title: mockItemWithVideo.name,
          description: mockItemWithVideo.description,
        })
      );

      const pricePos = html.indexOf('data-testid="reel-price"');
      const titlePos = html.indexOf('data-testid="reel-title"');
      const descPos = html.indexOf('data-testid="reel-description"');

      expect(pricePos).toBeGreaterThan(-1);
      expect(titlePos).toBeGreaterThan(-1);
      expect(descPos).toBeGreaterThan(-1);

      // Strict immutable sequence in DOM
      expect(pricePos).toBeLessThan(titlePos);
      expect(titlePos).toBeLessThan(descPos);
    });

    it("formats price with regional currency symbol and thousands separator", () => {
      const formatted = formatReelPrice(14500, "ARS");
      expect(formatted).toBe("14.500");

      const html = renderToStaticMarkup(
        React.createElement(ReelOverlay, {
          price: 14500,
          title: "Doble Smash",
          description: "Rica burger",
        })
      );

      expect(html).toContain("$");
      expect(html).toContain("14.500");
    });

    it("renders scrim-bottom gradient with height of at least 340px", () => {
      const html = renderToStaticMarkup(
        React.createElement(ReelOverlay, {
          price: 5000,
          title: "Limonada",
          description: "Fresca con menta",
        })
      );

      expect(html).toContain('data-testid="reel-scrim-bottom"');
      expect(html).toContain("min-h-[340px]");
    });
  });

  describe("ReelsCategoryNav (Story 2.4)", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it("renders category pills and marks active category with contrast styles", () => {
      const categories = [mockCategory1, mockCategory2];

      const html = renderToStaticMarkup(
        React.createElement(ReelsCategoryNav, {
          categories,
          activeCategoryId: "cat-burgers",
        })
      );

      expect(html).toContain('data-testid="category-pill-cat-burgers"');
      expect(html).toContain('data-testid="category-pill-cat-drinks"');
      expect(html).toContain('data-active="true"');
      expect(html).toContain("bg-white text-black");
    });

    it("invokes scrollIntoView on the first reel of the category when clicked", () => {
      const mockScrollIntoView = vi.fn();
      const mockQuerySelector = vi.fn().mockReturnValue({
        scrollIntoView: mockScrollIntoView,
      });

      vi.stubGlobal("document", {
        querySelector: mockQuerySelector,
      });
      vi.stubGlobal("window", {
        matchMedia: vi.fn().mockReturnValue({ matches: false }),
      });

      const onSelectCategory = vi.fn();

      const element = ReelsCategoryNav({
        categories: [mockCategory1, mockCategory2],
        activeCategoryId: "cat-burgers",
        onSelectCategory,
      });

      expect(element).toBeDefined();

      const navContainer = element?.props?.children;
      const buttons = navContainer.props.children;
      const drinksButton = buttons[1];

      drinksButton.props.onClick();

      expect(onSelectCategory).toHaveBeenCalledWith("cat-drinks");
      expect(mockQuerySelector).toHaveBeenCalledWith('[data-category-id="cat-drinks"]');
      expect(mockScrollIntoView).toHaveBeenCalledWith({
        behavior: "smooth",
        block: "start",
      });
    });
  });

  describe("ReelItem Component Composition", () => {
    it("renders 100dvh container with scroll-snap-align: start and ARIA semantics", () => {
      const html = renderToStaticMarkup(
        React.createElement(ReelItem, {
          item: mockItemWithVideo,
          categoryId: mockCategory1.documentId,
        })
      );

      expect(html).toContain('data-testid="reel-item"');
      expect(html).toContain('role="region"');
      expect(html).toContain(
        `aria-label="Plato: ${mockItemWithVideo.name}, Precio: $${mockItemWithVideo.price}"`
      );
      expect(html).toContain("h-[100dvh]");
      expect(html).toContain("scroll-snap-align:start");
      expect(html).toContain(`data-id="${mockItemWithVideo.documentId}"`);
      expect(html).toContain(`data-category-id="${mockCategory1.documentId}"`);
    });
  });

  describe("ReelsMenuView Full Assembly", () => {
    it("assembles ReelFeedContainer, ReelsCategoryNav, and ReelItems", () => {
      const categories = [mockCategory1, mockCategory2];
      const items = [mockItemWithVideo, mockItemWithoutVideo];

      const html = renderToStaticMarkup(
        React.createElement(ReelsMenuView, {
          categories,
          items,
          tenantSlug: "mi-resto",
        })
      );

      expect(html).toContain('data-testid="reels-menu-view"');
      expect(html).toContain('data-testid="reel-feed-container"');
      expect(html).toContain('data-testid="reels-category-nav"');
      expect(html).toContain('data-testid="reel-scrim-top"');
      expect(html).toContain(`data-id="${mockItemWithVideo.documentId}"`);
      expect(html).toContain(`data-id="${mockItemWithoutVideo.documentId}"`);
    });

    it("renders friendly empty state when items list is empty", () => {
      const html = renderToStaticMarkup(
        React.createElement(ReelsMenuView, {
          categories: [],
          items: [],
        })
      );

      expect(html).toContain('data-testid="reels-empty-state"');
      expect(html).toContain("Menú en preparación");
    });
  });

  describe("useReelsMediaLifecycle Hook & Manager Logic", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it("initializes hook inside component with initial category and exposes callbacks", () => {
      function TestHookComponent() {
        const {
          activeCategoryId,
          registerReelElement,
          registerVideoElement,
          setActiveCategoryId,
        } = useReelsMediaLifecycle({
          initialCategoryId: "cat-1",
        });

        return React.createElement("div", {
          "data-testid": "hook-output",
          "data-category": activeCategoryId,
          "data-has-register-reel": String(typeof registerReelElement === "function"),
          "data-has-register-video": String(typeof registerVideoElement === "function"),
          "data-has-set-category": String(typeof setActiveCategoryId === "function"),
        });
      }

      const html = renderToStaticMarkup(React.createElement(TestHookComponent));

      expect(html).toContain('data-category="cat-1"');
      expect(html).toContain('data-has-register-reel="true"');
      expect(html).toContain('data-has-register-video="true"');
      expect(html).toContain('data-has-set-category="true"');
    });

    it("registers observer and controls play/pause when elements intersect threshold", () => {
      const mockObserve = vi.fn();
      const mockUnobserve = vi.fn();
      const mockDisconnect = vi.fn();

      class MockIntersectionObserver {
        observe = mockObserve;
        unobserve = mockUnobserve;
        disconnect = mockDisconnect;
      }

      vi.stubGlobal("window", {});
      vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

      const onActiveCategoryChange = vi.fn();
      const onActiveReelChange = vi.fn();

      const manager = new ReelsMediaLifecycleManager({
        threshold: 0.6,
        onActiveReelChange,
        onActiveCategoryChange,
      });

      const mockVideo1 = {
        play: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn(),
        currentTime: 10,
        preload: "none",
      } as unknown as HTMLVideoElement;

      const mockVideo2 = {
        play: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn(),
        currentTime: 0,
        preload: "none",
      } as unknown as HTMLVideoElement;

      const mockEl1 = { dataset: { id: "reel-1" } } as unknown as HTMLElement;
      const mockEl2 = { dataset: { id: "reel-2" } } as unknown as HTMLElement;

      manager.registerVideoElement("reel-1", mockVideo1);
      manager.registerReelElement("reel-1", mockEl1, { categoryId: "cat-1", index: 0 });

      manager.registerVideoElement("reel-2", mockVideo2);
      manager.registerReelElement("reel-2", mockEl2, { categoryId: "cat-2", index: 1 });

      // Connect observer
      const disconnect = manager.connect();

      expect(mockObserve).toHaveBeenCalledWith(mockEl1);
      expect(mockObserve).toHaveBeenCalledWith(mockEl2);

      // Simulate intersection entry for reel-1 with ratio >= 0.6
      manager.handleIntersectionEntries([
        {
          target: mockEl1,
          isIntersecting: true,
          intersectionRatio: 0.7,
        },
      ]);

      expect(onActiveReelChange).toHaveBeenCalledWith("reel-1");
      expect(onActiveCategoryChange).toHaveBeenCalledWith("cat-1");
      expect(mockVideo1.play).toHaveBeenCalled();
      // Reel-2 should be preloaded (index 1 = adjacent)
      expect(mockVideo2.preload).toBe("metadata");

      // Now scroll reel-1 out (ratio < 0.6)
      manager.handleIntersectionEntries([
        {
          target: mockEl1,
          isIntersecting: true,
          intersectionRatio: 0.3,
        },
      ]);

      expect(mockVideo1.pause).toHaveBeenCalled();
      expect(mockVideo1.currentTime).toBe(0);

      // Disconnect
      disconnect();
      expect(mockDisconnect).toHaveBeenCalled();
    });
  });
});
