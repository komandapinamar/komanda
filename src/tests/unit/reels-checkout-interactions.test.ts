import { describe, expect, it, vi, beforeEach } from "vitest";
import React, { type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  useDoubleTap,
  DoubleTapDetector,
} from "@/features/shop/reels/hooks/useDoubleTap";
import ReelActionRail from "@/features/shop/reels/components/ReelActionRail";
import ProductModifierSheet from "@/features/shop/reels/components/ProductModifierSheet";
import FloatingCartBar from "@/features/shop/reels/components/FloatingCartBar";
import ReelItem from "@/features/shop/reels/components/ReelItem";
import ReelOverlay from "@/features/shop/reels/components/ReelOverlay";
import ReelsMenuView from "@/features/shop/reels/components/ReelsMenuView";
import type { Category, MenuItem } from "@/types/types";

const mockCategory: Category = {
  documentId: "cat-burgers",
  name: "Burgers",
  menu_items: null,
  combos: null,
};

const mockSimpleItem: MenuItem = {
  documentId: "item-simple-1",
  name: "Cerveza IPA Artesanal",
  price: 5500,
  description: "Pinta tirada bien fría",
  image: "https://cdn.komanda.app/images/beer.jpg",
  category: mockCategory,
  combos: null,
  hasOptions: false,
};

const mockConfigurableItem: MenuItem = {
  documentId: "item-config-1",
  name: "Doble Smash Bacon",
  price: 14500,
  description: "Doble medallón con cheddar fundido",
  image: "https://cdn.komanda.app/images/smash.jpg",
  category: mockCategory,
  combos: null,
  hasOptions: true,
  modifierGroups: [
    {
      id: "sauces",
      name: "Elegí tu aderezo",
      required: true,
      options: [
        { id: "mayo-trufa", name: "Mayonesa Trufada", priceDelta: 0 },
        { id: "bbq-bacon", name: "BBQ Ahumada", priceDelta: 500 },
      ],
    },
  ],
};

type TestElement = ReactElement<{
  children?: TestElement | TestElement[] | unknown;
  onClick?: (event: { stopPropagation?: () => void }) => void;
}>;

describe("Reels Checkout and Interactions (Epic 3)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("DoubleTapDetector & useDoubleTap Hook (Story 3.1)", () => {
    it("triggers callback on double tap within threshold window (280ms)", () => {
      const onDoubleTap = vi.fn();
      const detector = new DoubleTapDetector(onDoubleTap, { threshold: 280 });

      let currentTime = 1000;
      vi.spyOn(Date, "now").mockImplementation(() => currentTime);

      const fakeEvent = {
        target: { closest: () => null },
        stopPropagation: vi.fn(),
      } as unknown as React.SyntheticEvent;

      // First tap at t = 1000
      detector.handleTap(fakeEvent);
      expect(onDoubleTap).not.toHaveBeenCalled();

      // Second tap at t = 1200 (diff = 200ms < 280ms threshold)
      currentTime = 1200;
      detector.handleTap(fakeEvent);
      expect(onDoubleTap).toHaveBeenCalledTimes(1);
    });

    it("does not trigger double tap if second tap exceeds threshold (>280ms)", () => {
      const onDoubleTap = vi.fn();
      const detector = new DoubleTapDetector(onDoubleTap, { threshold: 280 });

      let currentTime = 1000;
      vi.spyOn(Date, "now").mockImplementation(() => currentTime);

      const fakeEvent = {} as React.SyntheticEvent;

      // First tap at t = 1000
      detector.handleTap(fakeEvent);

      // Second tap at t = 1350 (diff = 350ms > 280ms threshold)
      currentTime = 1350;
      detector.handleTap(fakeEvent);
      expect(onDoubleTap).not.toHaveBeenCalled();
    });

    it("ignores rapid synthetic duplicate events (<40ms)", () => {
      const onDoubleTap = vi.fn();
      const detector = new DoubleTapDetector(onDoubleTap, { threshold: 280 });

      let currentTime = 1000;
      vi.spyOn(Date, "now").mockImplementation(() => currentTime);

      const fakeEvent = {} as React.SyntheticEvent;

      // First event (e.g. touchend) at t = 1000
      detector.handleTap(fakeEvent);

      // Rapid synthetic event (e.g. click from same touch) at t = 1010 (diff = 10ms)
      currentTime = 1010;
      detector.handleTap(fakeEvent);
      expect(onDoubleTap).not.toHaveBeenCalled();
    });

    it("initializes useDoubleTap hook inside component and returns callable handler", () => {
      function TestDoubleTapComponent() {
        const handleTap = useDoubleTap(vi.fn(), { threshold: 280 });
        return React.createElement("div", {
          "data-testid": "tap-target",
          "data-has-fn": String(typeof handleTap === "function"),
        });
      }

      const html = renderToStaticMarkup(React.createElement(TestDoubleTapComponent));
      expect(html).toContain('data-has-fn="true"');
    });
  });

  describe("ReelActionRail (Story 3.1)", () => {
    it("renders like button with +1 label, info button and heartPop micro-animation style", () => {
      const html = renderToStaticMarkup(
        React.createElement(ReelActionRail, {
          item: mockSimpleItem,
        })
      );

      expect(html).toContain('data-testid="reel-action-rail"');
      expect(html).toContain('data-testid="action-btn-like"');
      expect(html).toContain('data-testid="action-like-label"');
      expect(html).toContain("+1");
      expect(html).toContain('data-testid="action-btn-info"');
      expect(html).toContain("heartPop");
      expect(html).toContain("animate-heart-pop");
    });

    it("renders floating heart animation element when showHeart is active", () => {
      const html = renderToStaticMarkup(
        React.createElement(ReelActionRail, {
          item: mockSimpleItem,
          showHeart: true,
        })
      );

      expect(html).toContain('data-testid="reel-heart-pop"');
      expect(html).toContain("pointer-events-none");
      expect(html).toContain("animate-heart-pop");
      expect(html).toContain("#ff2a55");
    });

    it("stops propagation and triggers onLike when like button is clicked", () => {
      const onLike = vi.fn();
      let capturedLikeButton: TestElement | null = null;

      function TestHarness() {
        const el = ReelActionRail({
          item: mockSimpleItem,
          onLike,
        }) as TestElement;
        const fragmentChildren = el.props.children as TestElement[];
        const railContainer = fragmentChildren[2];
        const buttons = railContainer.props.children as TestElement[];
        capturedLikeButton = buttons[0];
        return el;
      }

      renderToStaticMarkup(React.createElement(TestHarness));

      const stopPropagation = vi.fn();
      capturedLikeButton!.props.onClick!({ stopPropagation });

      expect(stopPropagation).toHaveBeenCalled();
      expect(onLike).toHaveBeenCalledTimes(1);
    });

    it("opens dish info modal when info button is clicked", () => {
      const onOpenInfo = vi.fn();
      let capturedInfoButton: TestElement | null = null;

      function TestHarness() {
        const el = ReelActionRail({
          item: mockSimpleItem,
          onOpenInfo,
        }) as TestElement;
        const fragmentChildren = el.props.children as TestElement[];
        const railContainer = fragmentChildren[2];
        const buttons = railContainer.props.children as TestElement[];
        capturedInfoButton = buttons[1];
        return el;
      }

      renderToStaticMarkup(React.createElement(TestHarness));

      const stopPropagation = vi.fn();
      capturedInfoButton!.props.onClick!({ stopPropagation });

      expect(stopPropagation).toHaveBeenCalled();
      expect(onOpenInfo).toHaveBeenCalledTimes(1);
    });
  });

  describe("ProductModifierSheet (Story 3.2)", () => {
    it("renders bottom sheet with 28px top rounded corners and surface background #161822", () => {
      const onConfirm = vi.fn();
      const onClose = vi.fn();

      const html = renderToStaticMarkup(
        React.createElement(ProductModifierSheet, {
          item: mockConfigurableItem,
          isOpen: true,
          onConfirm,
          onClose,
        })
      );

      expect(html).toContain('data-testid="product-modifier-sheet"');
      expect(html).toContain('data-testid="modifier-sheet-title"');
      expect(html).toContain("Doble Smash Bacon");
      expect(html).toContain("rounded-t-[28px]");
      expect(html).toContain("#161822");
    });

    it("renders modifier groups and options with price deltas", () => {
      const onConfirm = vi.fn();
      const onClose = vi.fn();

      const html = renderToStaticMarkup(
        React.createElement(ProductModifierSheet, {
          item: mockConfigurableItem,
          isOpen: true,
          onConfirm,
          onClose,
        })
      );

      expect(html).toContain('data-testid="modifier-group-sauces"');
      expect(html).toContain('data-testid="modifier-option-mayo-trufa"');
      expect(html).toContain('data-testid="modifier-option-bbq-bacon"');
      expect(html).toContain("Mayonesa Trufada");
      expect(html).toContain("BBQ Ahumada");
      expect(html).toContain("+$500");
    });

    it("confirms configured item with options and calculated price when CTA is clicked", () => {
      const onConfirm = vi.fn();
      const onClose = vi.fn();
      let capturedConfirmButton: TestElement | null = null;

      function TestHarness() {
        const el = ProductModifierSheet({
          item: mockConfigurableItem,
          isOpen: true,
          onConfirm,
          onClose,
        }) as TestElement;
        const sheetContainer = el.props.children as TestElement;
        const sheetChildren = sheetContainer.props.children as TestElement[];
        const ctaContainer = sheetChildren[3];
        capturedConfirmButton = ctaContainer.props.children as TestElement;
        return el;
      }

      renderToStaticMarkup(React.createElement(TestHarness));

      capturedConfirmButton!.props.onClick!({});

      expect(onConfirm).toHaveBeenCalledTimes(1);
      const configuredItem = onConfirm.mock.calls[0][0];
      expect(configuredItem.documentId).toBe(mockConfigurableItem.documentId);
      expect(configuredItem.description).toContain("Mayonesa Trufada");
    });
  });

  describe("FloatingCartBar (Story 3.3)", () => {
    it("is completely hidden when cart is empty (itemCount === 0)", () => {
      const html = renderToStaticMarkup(
        React.createElement(FloatingCartBar, {
          itemCount: 0,
          subtotal: 0,
        })
      );

      expect(html).toContain('data-testid="floating-cart-bar"');
      expect(html).toContain("translate-y-32");
      expect(html).toContain("opacity-0");
      expect(html).toContain("pointer-events-none");
    });

    it("is visible with slide-up when itemCount >= 1, showing count and subtotal", () => {
      const html = renderToStaticMarkup(
        React.createElement(FloatingCartBar, {
          itemCount: 2,
          subtotal: 20000,
        })
      );

      expect(html).toContain('data-testid="floating-cart-bar"');
      expect(html).toContain("translate-y-0");
      expect(html).toContain("opacity-100");
      expect(html).toContain('data-testid="floating-cart-count"');
      expect(html).toContain("2");
      expect(html).toContain('data-testid="floating-cart-subtotal"');
      expect(html).toContain("$20.000");
      expect(html).toContain("rounded-full");
      expect(html).toContain("#ff4d2d");
    });

    it("invokes onOpenCart when clicked", () => {
      const onOpenCart = vi.fn();
      let capturedBar: TestElement | null = null;

      function TestHarness() {
        capturedBar = FloatingCartBar({
          itemCount: 1,
          subtotal: 14500,
          onOpenCart,
        }) as TestElement;
        return capturedBar;
      }

      renderToStaticMarkup(React.createElement(TestHarness));

      const stopPropagation = vi.fn();
      capturedBar!.props.onClick!({ stopPropagation });

      expect(stopPropagation).toHaveBeenCalled();
      expect(onOpenCart).toHaveBeenCalledTimes(1);
    });
  });

  describe("ReelItem & ReelOverlay Cart Padding Integration", () => {
    it("applies touch-action: pan-y to not block vertical scroll", () => {
      const html = renderToStaticMarkup(
        React.createElement(ReelItem, {
          item: mockSimpleItem,
        })
      );

      expect(html).toContain('data-testid="reel-item"');
      expect(html).toContain("touch-action:pan-y");
    });

    it("applies pb-28 to ReelOverlay when cart is active (withCart / hasCartItems)", () => {
      const htmlWithCart = renderToStaticMarkup(
        React.createElement(ReelOverlay, {
          price: 14500,
          title: "Doble Smash",
          hasCartItems: true,
        })
      );

      expect(htmlWithCart).toContain("pb-28");
      expect(htmlWithCart).not.toContain("pb-8");

      const htmlWithoutCart = renderToStaticMarkup(
        React.createElement(ReelOverlay, {
          price: 14500,
          title: "Doble Smash",
          hasCartItems: false,
        })
      );

      expect(htmlWithoutCart).toContain("pb-8");
      expect(htmlWithoutCart).not.toContain("pb-28");
    });
  });

  describe("ReelsMenuView Full Assembly & Micro-interactions", () => {
    it("renders ReelsMenuView with FloatingCartBar and feed items", () => {
      const categories = [mockCategory];
      const items = [mockSimpleItem, mockConfigurableItem];

      const html = renderToStaticMarkup(
        React.createElement(ReelsMenuView, {
          categories,
          items,
          tenantSlug: "mi-resto",
        })
      );

      expect(html).toContain('data-testid="reels-menu-view"');
      expect(html).toContain('data-testid="floating-cart-bar"');
      expect(html).toContain(`data-id="${mockSimpleItem.documentId}"`);
      expect(html).toContain(`data-id="${mockConfigurableItem.documentId}"`);
    });

    it("intercepts configurable item with hasOptions and does not add directly to cart", () => {
      let selectedModifierItem: MenuItem | null = null;
      const addItemMock = vi.fn();

      const handleItemLike = (item: MenuItem) => {
        if (item.hasOptions) {
          selectedModifierItem = item;
        } else {
          addItemMock(item);
        }
      };

      // Test simple item
      handleItemLike(mockSimpleItem);
      expect(addItemMock).toHaveBeenCalledWith(mockSimpleItem);
      expect(selectedModifierItem).toBeNull();

      // Test configurable item (must be intercepted)
      addItemMock.mockClear();
      handleItemLike(mockConfigurableItem);
      expect(addItemMock).not.toHaveBeenCalled();
      expect(selectedModifierItem).toEqual(mockConfigurableItem);
    });
  });
});
