'use client';

import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useViewSettings } from '../contexts';
import { useMediaQuery } from '../hooks/use-media-query';
import { COARSE_POINTER_QUERY } from '../lib/hud-layout';
import { Icon, type PlotcraftIconName } from '../plotcraft/icon';
import type { InteractiveKind } from '../lib/walk-interact';

export interface WalkHudProps {
  /** Pointer lock is engaged: the keys walk and the mouse looks. */
  locked: boolean;
  /** The browser refused pointer lock; the next click asks again (#351). */
  lockRefused: boolean;
  /** The seat in reach, while standing (#463b). */
  seatName: string | null;
  /** Whether the seat in reach is a bed. */
  isBed?: boolean;
  seated: boolean;
  lying?: boolean;
  floorName: string;
  /** PgUp / PgDn have somewhere to go (#446). */
  multiFloor: boolean;
  /** The touch stick: x right, y forward, each in [−1, 1]. */
  onStick(x: number, y: number): void;
  onToggleSit(): void;
  onToggleLie?(): void;
  onExit(): void;
  /** The interactable target currently in reach and view, if any. */
  interactTarget?: {
    id: string;
    name: string;
    type: string;
    kind: InteractiveKind;
    active: boolean;
  } | null;
  onToggleInteract?(): void;
}

/**
 * The walkthrough HUD (#454, #446, #463): what to do right now, in the
 * walker's own words. Before the pointer is locked it says how to start
 * and that a second Esc leaves; once locked, the walking keys; a seat in
 * reach gets an `E` prompt under the reticle; the floor and the clock sit
 * at the top. On a touch screen there is no lock: a drag looks around, a
 * stick walks, and buttons sit, stand and leave.
 */
export function WalkHud(props: WalkHudProps): JSX.Element {
  const touch = useMediaQuery(COARSE_POINTER_QUERY);
  return touch ? <TouchWalkHud {...props} /> : <DesktopWalkHud {...props} />;
}

function DesktopWalkHud({
  locked,
  lockRefused,
  seatName,
  isBed = false,
  seated,
  lying = false,
  floorName,
  multiFloor,
  interactTarget,
}: WalkHudProps): JSX.Element {
  let prompt: string | null = null;
  let promptKey = 'E';
  let secondaryPrompt: string | null = null;
  let secondaryKey: string | null = null;

  if (seated || lying) {
    prompt = 'Stand up';
    promptKey = 'E / F';
  } else if (interactTarget) {
    const { kind, name, active } = interactTarget;
    if (kind === 'seat') {
      if (isBed) {
        prompt = `Sit on ${name}`;
        promptKey = 'E';
        secondaryPrompt = 'Lie down';
        secondaryKey = 'F';
      } else {
        prompt = `Sit on ${name}`;
        promptKey = 'E';
      }
    } else if (kind === 'lamp') {
      prompt = active ? `Turn off ${name}` : `Turn on ${name}`;
      promptKey = 'E';
    } else if (kind === 'tv') {
      prompt = active ? 'Turn off TV' : 'Turn on TV';
      promptKey = 'E';
    } else if (kind === 'water') {
      prompt = active ? `Turn off ${name}` : `Turn on ${name}`;
      promptKey = 'E';
    } else if (kind === 'stove') {
      prompt = active ? 'Turn off stove' : 'Turn on stove';
      promptKey = 'E';
    } else if (kind === 'door') {
      prompt = active ? 'Close door' : 'Open door';
      promptKey = 'E';
    } else if (kind === 'storage') {
      prompt = active ? `Close ${name}` : `Open ${name}`;
      promptKey = 'E';
    }
  } else if (seatName) {
    if (isBed) {
      prompt = `Sit on ${seatName}`;
      promptKey = 'E';
      secondaryPrompt = 'Lie down';
      secondaryKey = 'F';
    } else {
      prompt = `Sit on ${seatName}`;
      promptKey = 'E';
    }
  }

  return (
    <>
      <StatusBar floorName={floorName} />
      {locked && (
        <Reticle
          prompt={prompt}
          promptKey={promptKey}
          secondaryPrompt={secondaryPrompt}
          secondaryKey={secondaryKey}
        />
      )}
      <div
        className="pointer-events-none absolute bottom-4 left-1/2"
        style={{ transform: 'translateX(-50%)' }}
        role="status"
      >
        <HintChip>
          <Icon name="live" size={14} />
          {lockRefused ? (
            <span>Click again to look around</span>
          ) : !locked ? (
            <>
              <Hint label="to look around">Click</Hint>
              <Dot />
              <Hint label="again to exit">Esc</Hint>
            </>
          ) : (
            <>
              <Hint label="walk">WASD</Hint>
              <Dot />
              <Hint label="sprint">Shift</Hint>
              {multiFloor && (
                <>
                  <Dot />
                  <Hint label="floor">PgUp/PgDn</Hint>
                </>
              )}
              <Dot />
              <Hint label="time">[ ]</Hint>
              <Dot />
              <Hint label="release">Esc</Hint>
            </>
          )}
        </HintChip>
      </div>
    </>
  );
}

function TouchWalkHud({
  seatName,
  isBed = false,
  seated,
  lying = false,
  floorName,
  onStick,
  onToggleSit,
  onToggleLie,
  onExit,
  interactTarget,
  onToggleInteract,
}: WalkHudProps): JSX.Element {
  const isUp = seated || lying;
  const canAct = isUp || interactTarget != null || seatName !== null;

  let buttonLabel = isUp ? 'Stand' : 'Sit';
  let buttonIcon: PlotcraftIconName = isUp ? 'arrowU' : 'sofa';
  let actionHandler = onToggleSit;

  if (isUp) {
    buttonLabel = 'Stand';
    buttonIcon = 'arrowU';
    actionHandler = onToggleSit;
  } else if (interactTarget) {
    actionHandler = onToggleInteract ?? onToggleSit;
    switch (interactTarget.kind) {
      case 'seat':
        buttonLabel = 'Sit';
        buttonIcon = isBed ? 'bed' : 'sofa';
        break;
      case 'lamp':
        buttonLabel = interactTarget.active ? 'Off' : 'Light';
        buttonIcon = 'lamp';
        break;
      case 'tv':
        buttonLabel = interactTarget.active ? 'Off' : 'TV';
        buttonIcon = 'tv';
        break;
      case 'water':
        buttonLabel = interactTarget.active ? 'Stop' : 'Water';
        buttonIcon = 'sink';
        break;
      case 'stove':
        buttonLabel = interactTarget.active ? 'Off' : 'Cook';
        buttonIcon = 'stove';
        break;
      case 'door':
        buttonLabel = interactTarget.active ? 'Close' : 'Open';
        buttonIcon = 'door';
        break;
      case 'storage':
        buttonLabel = interactTarget.active ? 'Close' : 'Open';
        buttonIcon = 'wardrobe';
        break;
    }
  }

  return (
    <>
      <StatusBar floorName={floorName} hint="Drag to look" onExit={onExit} />
      <Reticle prompt={null} promptKey="" />
      <Stick onStick={onStick} />
      {canAct && (
        <div
          className="absolute flex items-center gap-2"
          style={{
            ...ACTION_POSITION,
            right: 'calc(16px + env(safe-area-inset-right, 0px))',
            zIndex: 26,
          }}
        >
          <button
            type="button"
            onClick={actionHandler}
            className="pc-glass pc-glass--dark"
            aria-label={isUp ? 'Stand up' : buttonLabel}
            style={{
              minWidth: 88,
              height: 48,
              padding: '0 16px',
              borderRadius: 24,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              fontFamily: 'var(--pc-font-display)',
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: 'var(--pc-cyan-glow)',
              border: '1.5px solid var(--pc-cyan-glow)',
            }}
          >
            <Icon name={buttonIcon} size={16} />
            {buttonLabel}
          </button>
          {!isUp && isBed && onToggleLie && (!interactTarget || interactTarget.kind === 'seat') && (
            <button
              type="button"
              onClick={onToggleLie}
              className="pc-glass pc-glass--dark"
              aria-label="Lie down on bed"
              style={{
                minWidth: 88,
                height: 48,
                padding: '0 16px',
                borderRadius: 24,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                fontFamily: 'var(--pc-font-display)',
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: 'var(--pc-cyan-glow)',
                border: '1.5px solid var(--pc-cyan-glow)',
              }}
            >
              <Icon name="bed" size={16} />
              Lie
            </button>
          )}
        </div>
      )}
    </>
  );
}

/**
 * Just above the mode panel, wherever it ends (`--pc-mode-top`, measured on
 * the painted panel: the HUD box reaches near the top of a tablet, #672). The
 * stick has no such anchor: it takes the free bottom-left corner, or rides
 * above a phone's full-width mode bar (`.pc-walk-stick`, globals.css).
 */
const ACTION_POSITION: CSSProperties = {
  bottom: 'calc(100% - var(--pc-mode-top, 100%) + 16px)',
};

const STICK_SIZE = 116;
const KNOB_SIZE = 48;
/** A push under this fraction of the throw is a resting thumb, not a step. */
const STICK_DEAD_ZONE = 0.12;

/** A thumb stick: drag the knob, the walker walks that way, harder for a fuller throw. */
function Stick({ onStick }: { onStick(x: number, y: number): void }): JSX.Element {
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const pointerRef = useRef<number | null>(null);
  const reach = (STICK_SIZE - KNOB_SIZE) / 2;

  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    let dx = event.clientX - (rect.left + rect.width / 2);
    let dy = event.clientY - (rect.top + rect.height / 2);
    const length = Math.hypot(dx, dy);
    if (length > reach) {
      dx = (dx / length) * reach;
      dy = (dy / length) * reach;
    }
    setKnob({ x: dx, y: dy });
    const push = Math.min(1, length / reach);
    if (push < STICK_DEAD_ZONE) onStick(0, 0);
    else onStick(dx / reach, -dy / reach);
  };
  const release = () => {
    pointerRef.current = null;
    setKnob({ x: 0, y: 0 });
    onStick(0, 0);
  };

  return (
    <div
      data-walk-stick=""
      role="group"
      aria-label="Walk: drag to move"
      className="pc-glass pc-glass--dark pc-walk-stick absolute"
      onPointerDown={(event) => {
        if (pointerRef.current !== null) return;
        pointerRef.current = event.pointerId;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        move(event);
      }}
      onPointerMove={(event) => {
        if (event.pointerId === pointerRef.current) move(event);
      }}
      onPointerUp={(event) => {
        if (event.pointerId === pointerRef.current) release();
      }}
      onPointerCancel={(event) => {
        if (event.pointerId === pointerRef.current) release();
      }}
      style={{
        left: 'calc(16px + env(safe-area-inset-left, 0px))',
        zIndex: 26,
        width: STICK_SIZE,
        height: STICK_SIZE,
        borderRadius: '50%',
        touchAction: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        aria-hidden
        style={{
          width: KNOB_SIZE,
          height: KNOB_SIZE,
          borderRadius: '50%',
          background: 'rgba(127, 243, 255, 0.22)',
          border: '1.5px solid var(--pc-cyan-glow)',
          boxShadow: 'var(--pc-halo-cyan-soft)',
          transform: `translate(${knob.x}px, ${knob.y}px)`,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

/** Floor and clock, top centre; on touch also the look hint and a way out. */
function StatusBar({ floorName, hint, onExit }: { floorName: string; hint?: string; onExit?(): void }): JSX.Element {
  const { timeOfDay } = useViewSettings('timeOfDay');
  const hours = Math.floor(timeOfDay);
  const minutes = Math.floor((timeOfDay - hours) * 60);
  const clock = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  const night = timeOfDay < 6 || timeOfDay >= 19;
  return (
    <div
      className="pc-top-chip absolute left-1/2"
      style={{ top: 104, transform: 'translateX(-50%)', zIndex: 31, pointerEvents: 'none' }}
    >
      <HintChip>
        <Icon name="stairs" size={14} />
        <span style={{ color: 'var(--pc-paper)' }}>{floorName}</span>
        <Dot />
        <SunMoon night={night} />
        <span style={{ color: 'var(--pc-paper)', fontVariantNumeric: 'tabular-nums' }}>
          <span className="sr-only">Time </span>
          {clock}
        </span>
        {hint && (
          <>
            <Dot />
            <span>{hint}</span>
          </>
        )}
        {onExit && (
          <button
            type="button"
            onClick={onExit}
            aria-label="Leave the walkthrough"
            className="pc-walk-exit"
            style={{
              pointerEvents: 'auto',
              marginLeft: 2,
              marginRight: -6,
              width: 32,
              height: 32,
              borderRadius: 16,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.18)',
              color: 'var(--pc-paper)',
            }}
          >
            <Icon name="close" size={14} />
          </button>
        )}
      </HintChip>
    </div>
  );
}

function Reticle({
  prompt,
  promptKey,
  secondaryPrompt,
  secondaryKey,
}: {
  prompt: string | null;
  promptKey: string;
  secondaryPrompt?: string | null;
  secondaryKey?: string | null;
}): JSX.Element {
  const active = prompt !== null;
  return (
    <div
      className="pointer-events-none absolute left-1/2 top-1/2"
      style={{ transform: 'translate(-50%, -50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
    >
      <div
        aria-hidden
        style={{
          height: active ? 18 : 10,
          width: active ? 18 : 10,
          borderRadius: 999,
          background: active ? 'transparent' : 'var(--pc-cyan-glow)',
          border: active ? '2px solid var(--pc-cyan-glow)' : 'none',
          boxShadow: 'var(--pc-halo-cyan)',
          transition: 'width 120ms ease, height 120ms ease',
        }}
      />
      {active && (
        <div style={{ position: 'absolute', top: 30, whiteSpace: 'nowrap' }} role="status">
          <HintChip>
            <Hint label={prompt}>{promptKey}</Hint>
            {secondaryPrompt && secondaryKey && (
              <>
                <Dot />
                <Hint label={secondaryPrompt}>{secondaryKey}</Hint>
              </>
            )}
          </HintChip>
        </div>
      )}
    </div>
  );
}

function HintChip({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div
      className="pc-glass pc-glass--dark"
      style={{
        padding: '6px 12px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        borderRadius: 999,
        fontFamily: 'var(--pc-font-display)',
        fontWeight: 600,
        fontSize: 11,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
        color: 'var(--pc-cyan-glow)',
      }}
    >
      {children}
    </div>
  );
}

/** A key cap and what it does. */
function Hint({ children, label }: { children: ReactNode; label: string }): JSX.Element {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <kbd
        style={{
          minWidth: 18,
          height: 18,
          padding: '0 5px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 5,
          border: '1px solid rgba(127, 243, 255, 0.45)',
          background: 'rgba(127, 243, 255, 0.08)',
          color: 'var(--pc-paper)',
          fontFamily: 'inherit',
          fontSize: 10,
          fontWeight: 700,
        }}
      >
        {children}
      </kbd>
      <span>{label}</span>
    </span>
  );
}

function Dot(): JSX.Element {
  return (
    <span aria-hidden style={{ opacity: 0.5 }}>
      ·
    </span>
  );
}

function SunMoon({ night }: { night: boolean }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width={14}
      height={14}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {night ? (
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
      ) : (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </>
      )}
    </svg>
  );
}
