/**
 * Better Auth database hooks: the account display name (`user.name`) goes
 * through the player-name blocklist at sign-up and on every update (QA N4).
 * It is not shown to other players today, but it is stored and could be.
 */
import { APIError } from "better-auth/api";
import { blockedDisplayName } from "../game/names";

export const NAME_NOT_ALLOWED = "NAME_NOT_ALLOWED";

function refuse(): never {
  throw new APIError("BAD_REQUEST", { code: NAME_NOT_ALLOWED, message: "This name is not allowed." });
}

export const displayNameHooks = {
  user: {
    create: {
      before: async (user: { name?: unknown }) => {
        if (blockedDisplayName(user.name)) refuse();
      },
    },
    update: {
      before: async (data: { name?: unknown }) => {
        if (data.name !== undefined && blockedDisplayName(data.name)) refuse();
      },
    },
  },
};
