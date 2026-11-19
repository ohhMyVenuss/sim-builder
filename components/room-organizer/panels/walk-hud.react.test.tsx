// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorViewProvider } from '../contexts';
import { createEditorViewStore } from '../hooks/editor-view-store';
import { makeViewSettings } from '../lib/__testfixtures__/fixtures';
import { WalkHud, type WalkHudProps } from './walk-hud';
import type { ReactNode } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Wrapper({ children }: { children: ReactNode }) {
  const store = createEditorViewStore(makeViewSettings());
  return (
    <EditorViewProvider store={store}>
      {children}
    </EditorViewProvider>
  );
}

const baseProps: WalkHudProps = {
  locked: true,
  lockRefused: false,
  seatName: null,
  seated: false,
  floorName: 'Ground Floor',
  multiFloor: false,
  onStick: vi.fn(),
  onToggleSit: vi.fn(),
  onExit: vi.fn(),
};

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    media: query,
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});

describe('WalkHud interactive prompts', () => {
  it('renders seat prompt with E key', () => {
    render(
      <Wrapper>
        <WalkHud
          {...baseProps}
          interactTarget={{
            id: 'chair-1',
            name: 'Office Chair',
            type: 'chair',
            kind: 'seat',
            active: false,
          }}
        />
      </Wrapper>
    );
    expect(screen.getByText('Sit on Office Chair')).toBeDefined();
    expect(screen.getByText('E')).toBeDefined();
  });

  it('renders bed prompt with E (sit) and F (lie down)', () => {
    render(
      <Wrapper>
        <WalkHud
          {...baseProps}
          isBed={true}
          interactTarget={{
            id: 'bed-1',
            name: 'Master Bed',
            type: 'bed',
            kind: 'seat',
            active: false,
          }}
        />
      </Wrapper>
    );
    expect(screen.getByText('Sit on Master Bed')).toBeDefined();
    expect(screen.getByText('Lie down')).toBeDefined();
    expect(screen.getByText('F')).toBeDefined();
  });

  it('renders lamp toggle prompts (Turn on / Turn off)', () => {
    const { rerender } = render(
      <Wrapper>
        <WalkHud
          {...baseProps}
          interactTarget={{
            id: 'lamp-1',
            name: 'Floor Lamp',
            type: 'floor-lamp',
            kind: 'lamp',
            active: false,
          }}
        />
      </Wrapper>
    );
    expect(screen.getByText('Turn on Floor Lamp')).toBeDefined();

    rerender(
      <Wrapper>
        <WalkHud
          {...baseProps}
          interactTarget={{
            id: 'lamp-1',
            name: 'Floor Lamp',
            type: 'floor-lamp',
            kind: 'lamp',
            active: true,
          }}
        />
      </Wrapper>
    );
    expect(screen.getByText('Turn off Floor Lamp')).toBeDefined();
  });

  it('renders TV toggle prompts', () => {
    const { rerender } = render(
      <Wrapper>
        <WalkHud
          {...baseProps}
          interactTarget={{
            id: 'tv-1',
            name: 'OLED TV',
            type: 'tv',
            kind: 'tv',
            active: false,
          }}
        />
      </Wrapper>
    );
    expect(screen.getByText('Turn on TV')).toBeDefined();

    rerender(
      <Wrapper>
        <WalkHud
          {...baseProps}
          interactTarget={{
            id: 'tv-1',
            name: 'OLED TV',
            type: 'tv',
            kind: 'tv',
            active: true,
          }}
        />
      </Wrapper>
    );
    expect(screen.getByText('Turn off TV')).toBeDefined();
  });

  it('renders door toggle prompts (Open door / Close door)', () => {
    const { rerender } = render(
      <Wrapper>
        <WalkHud
          {...baseProps}
          interactTarget={{
            id: 'door-1',
            name: 'Bedroom Door',
            type: 'door',
            kind: 'door',
            active: false,
          }}
        />
      </Wrapper>
    );
    expect(screen.getByText('Open door')).toBeDefined();

    rerender(
      <Wrapper>
        <WalkHud
          {...baseProps}
          interactTarget={{
            id: 'door-1',
            name: 'Bedroom Door',
            type: 'door',
            kind: 'door',
            active: true,
          }}
        />
      </Wrapper>
    );
    expect(screen.getByText('Close door')).toBeDefined();
  });

  it('renders water, stove and storage prompts', () => {
    const { rerender } = render(
      <Wrapper>
        <WalkHud
          {...baseProps}
          interactTarget={{
            id: 'sink-1',
            name: 'Kitchen Sink',
            type: 'kitchen-sink',
            kind: 'water',
            active: false,
          }}
        />
      </Wrapper>
    );
    expect(screen.getByText('Turn on Kitchen Sink')).toBeDefined();

    rerender(
      <Wrapper>
        <WalkHud
          {...baseProps}
          interactTarget={{
            id: 'stove-1',
            name: 'Stove',
            type: 'stove',
            kind: 'stove',
            active: false,
          }}
        />
      </Wrapper>
    );
    expect(screen.getByText('Turn on stove')).toBeDefined();

    rerender(
      <Wrapper>
        <WalkHud
          {...baseProps}
          interactTarget={{
            id: 'wardrobe-1',
            name: 'Wardrobe',
            type: 'wardrobe',
            kind: 'storage',
            active: false,
          }}
        />
      </Wrapper>
    );
    expect(screen.getByText('Open Wardrobe')).toBeDefined();
  });

  it('renders Stand up prompt when seated or lying', () => {
    render(
      <Wrapper>
        <WalkHud {...baseProps} seated={true} />
      </Wrapper>
    );
    expect(screen.getByText('Stand up')).toBeDefined();
    expect(screen.getByText('E / F')).toBeDefined();
  });
});
