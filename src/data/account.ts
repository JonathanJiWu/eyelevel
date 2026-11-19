/**
 * Delete every document that belongs to a user. Called before deleting the
 * Firebase Auth account (which must happen last, while still authenticated).
 */
import { getDoc, getDocs, query, where, writeBatch, type DocumentReference, type Firestore } from "firebase/firestore";
import { refs } from "./refs";

async function deleteAll(db: Firestore, docRefs: DocumentReference[]) {
  for (let i = 0; i < docRefs.length; i += 450) {
    const batch = writeBatch(db);
    for (const ref of docRefs.slice(i, i + 450)) batch.delete(ref);
    await batch.commit();
  }
}

export async function deleteUserData(db: Firestore, uid: string, usernameLower: string | null) {
  const [library, watchlists, activity, incoming, outgoing, friendships] = await Promise.all([
    getDocs(refs.library(db, uid)),
    getDocs(refs.watchlists(db, uid)),
    getDocs(refs.activity(db, uid)),
    getDocs(query(refs.friendRequests(db), where("to", "==", uid))),
    getDocs(query(refs.friendRequests(db), where("from", "==", uid))),
    getDocs(query(refs.friendships(db), where("members", "array-contains", uid))),
  ]);
  await deleteAll(db, [
    ...library.docs.map((d) => d.ref),
    ...watchlists.docs.map((d) => d.ref),
    ...activity.docs.map((d) => d.ref),
    ...incoming.docs.map((d) => d.ref),
    ...outgoing.docs.map((d) => d.ref),
    ...friendships.docs.map((d) => d.ref),
  ]);
  // Profile and private docs first; the username claim last (rules release a
  // claim only once the profile no longer uses it). Every step tolerates a
  // previous partial run, so deletion can simply be retried.
  await deleteAll(db, [refs.sharedIndex(db, uid), refs.profile(db, uid), refs.user(db, uid)]);
  if (usernameLower) {
    const claim = await getDoc(refs.username(db, usernameLower));
    if (claim.exists() && claim.data()?.uid === uid) await deleteAll(db, [claim.ref]);
  }
}
