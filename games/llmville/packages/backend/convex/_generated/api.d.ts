/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agentApiHttp from "../agentApiHttp.js";
import type * as auth from "../auth.js";
import type * as authOrigins from "../authOrigins.js";
import type * as bills from "../bills.js";
import type * as botActor from "../botActor.js";
import type * as bots from "../bots.js";
import type * as build from "../build.js";
import type * as clientErrors from "../clientErrors.js";
import type * as convexApiCatalog from "../convexApiCatalog.js";
import type * as crons from "../crons.js";
import type * as currency from "../currency.js";
import type * as dailyMarket from "../dailyMarket.js";
import type * as datacenter from "../datacenter.js";
import type * as founderContext from "../founderContext.js";
import type * as frontier from "../frontier.js";
import type * as http from "../http.js";
import type * as inference from "../inference.js";
import type * as inventory from "../inventory.js";
import type * as jgengine_runtime from "../jgengine/runtime.js";
import type * as jgengine_world from "../jgengine/world.js";
import type * as jgengine_worldObjects from "../jgengine/worldObjects.js";
import type * as market from "../market.js";
import type * as models from "../models.js";
import type * as multiplayer_worldChat from "../multiplayer/worldChat.js";
import type * as multiplayer_worldPresence from "../multiplayer/worldPresence.js";
import type * as permissions from "../permissions.js";
import type * as playbook from "../playbook.js";
import type * as playerApiAuth from "../playerApiAuth.js";
import type * as playerInternal from "../playerInternal.js";
import type * as playerProfile from "../playerProfile.js";
import type * as rack from "../rack.js";
import type * as serving from "../serving.js";
import type * as store from "../store.js";
import type * as tick from "../tick.js";
import type * as training from "../training.js";
import type * as unlocks from "../unlocks.js";
import type * as upgrades from "../upgrades.js";
import type * as user from "../user.js";
import type * as world from "../world.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agentApiHttp: typeof agentApiHttp;
  auth: typeof auth;
  authOrigins: typeof authOrigins;
  bills: typeof bills;
  botActor: typeof botActor;
  bots: typeof bots;
  build: typeof build;
  clientErrors: typeof clientErrors;
  convexApiCatalog: typeof convexApiCatalog;
  crons: typeof crons;
  currency: typeof currency;
  dailyMarket: typeof dailyMarket;
  datacenter: typeof datacenter;
  founderContext: typeof founderContext;
  frontier: typeof frontier;
  http: typeof http;
  inference: typeof inference;
  inventory: typeof inventory;
  "jgengine/runtime": typeof jgengine_runtime;
  "jgengine/world": typeof jgengine_world;
  "jgengine/worldObjects": typeof jgengine_worldObjects;
  market: typeof market;
  models: typeof models;
  "multiplayer/worldChat": typeof multiplayer_worldChat;
  "multiplayer/worldPresence": typeof multiplayer_worldPresence;
  permissions: typeof permissions;
  playbook: typeof playbook;
  playerApiAuth: typeof playerApiAuth;
  playerInternal: typeof playerInternal;
  playerProfile: typeof playerProfile;
  rack: typeof rack;
  serving: typeof serving;
  store: typeof store;
  tick: typeof tick;
  training: typeof training;
  unlocks: typeof unlocks;
  upgrades: typeof upgrades;
  user: typeof user;
  world: typeof world;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
