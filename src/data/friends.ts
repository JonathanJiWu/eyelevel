/**
 * Friend requests and friendships.
 *
 * Invariants (also enforced server-side by firestore.rules):
 *  - request ids are `${from}_${to}`, so duplicate requests are impossible;
 *  - you cannot request yourself, an existing friend, or someone who already
 *    requested you (accept theirs instead), or someone who disabled requests;
 *  - a friendship can only be created by the recipient of a pending request,
 *    and the request is deleted in the same atomic batch.
 */
import { doc, getDoc, serverTimestamp, writeBatch, type Firestore } from "firebase/firestore";
import { refs, toProfile } from "./refs";
import { pairId, requestId } from "./types";

export class FriendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FriendError";
  }
}

export async function sendFriendRequest(db: Firestore, me: string, to: string): Promise<"sent" | "accepted"> {
  if (me === to) throw new FriendError("You can't add yourself.");
  const [friendship, reverse, outgoing, profile] = await Promise.all([
    getDoc(refs.friendship(db, pairId(me, to))).catch(() => null),
    getDoc(refs.friendRequest(db, requestId(to, me))).catch(() => null),
    getDoc(refs.friendRequest(db, requestId(me, to))).catch(() => null),
    getDoc(refs.profile(db, to)),
  ]);
  if (friendship?.exists()) throw new FriendError("You're already friends.");
  if (reverse?.exists()) {
    // They already asked us — accepting is the only sensible action.
    await acceptFriendRequest(db, me, to);
    return "accepted";
  }
  if (outgoing?.exists()) throw new FriendError("Friend request already sent.");
  const recipient = toProfile(profile);
  if (!recipient) throw new FriendError("That user no longer exists.");
  if (!recipient.allowFriendRequests) throw new FriendError(`${recipient.displayName} isn't accepting friend requests.`);
  const batch = writeBatch(db);
  batch.set(refs.friendRequest(db, requestId(me, to)), { from: me, to, createdAt: serverTimestamp() });
  await batch.commit();
  return "sent";
}

export async function cancelFriendRequest(db: Firestore, me: string, to: string) {
  const batch = writeBatch(db);
  batch.delete(refs.friendRequest(db, requestId(me, to)));
  await batch.commit();
}

export async function declineFriendRequest(db: Firestore, me: string, from: string) {
  const batch = writeBatch(db);
  batch.delete(refs.friendRequest(db, requestId(from, me)));
  await batch.commit();
}

export async function acceptFriendRequest(db: Firestore, me: string, from: string) {
  const [a, b] = [me, from].sort();
  const mine = await getDoc(refs.friendRequest(db, requestId(me, from))).catch(() => null);
  const batch = writeBatch(db);
  batch.set(refs.friendship(db, pairId(me, from)), { members: [a, b], requestedBy: from, createdAt: serverTimestamp() });
  batch.delete(refs.friendRequest(db, requestId(from, me)));
  // If both people sent requests, clean up ours too.
  if (mine?.exists()) batch.delete(refs.friendRequest(db, requestId(me, from)));
  batch.set(doc(refs.activity(db, me)), {
    type: "friend_added",
    movieId: null,
    title: null,
    listId: null,
    listName: null,
    rating: null,
    createdAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function removeFriend(db: Firestore, me: string, other: string) {
  const batch = writeBatch(db);
  batch.delete(refs.friendship(db, pairId(me, other)));
  await batch.commit();
}
