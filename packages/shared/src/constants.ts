/** Seat limits for a room. */
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 10;

/** Deck limits. Total cards in the shoe = CARDS_PER_DECK * decks. */
export const CARDS_PER_DECK = 52;
export const MIN_DECKS = 1;
export const MAX_DECKS = 2;
export const DEFAULT_DECKS = 1;

/** Points for making an exact bid of zero. */
export const ZERO_BID_POINTS = 10;
/** Points per trick for making an exact non-zero bid (bid * 11). */
export const POINTS_PER_BID = 11;

/** Above this many rounds the lobby warns the host the game will be long. */
export const LONG_GAME_ROUNDS = 15;

/** Turn timer choices offered in the lobby, in seconds. 0 = no timer. */
export const TURN_TIMER_OPTIONS = [0, 20, 30, 45, 60] as const;
export const DEFAULT_TURN_SECONDS = 30;

export const MAX_NAME_LENGTH = 16;
export const ROOM_CODE_LENGTH = 5;
/** Ambiguity-free alphabet for room codes (no 0/O, 1/I/L). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
