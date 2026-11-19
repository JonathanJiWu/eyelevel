import React, { useState } from "react";
import { Button } from "@/src/components/ui/Button";
import { Chip, ChipRow } from "@/src/components/ui/Chip";
import { Sheet } from "@/src/components/ui/Sheet";
import { Notice } from "@/src/components/ui/States";
import { TextField } from "@/src/components/ui/TextField";
import { AppText } from "@/src/components/ui/AppText";
import type { Visibility } from "@/src/data/types";
import { LIMITS } from "@/src/data/types";
import { friendlyError } from "@/src/lib/errors";
import { validateListName } from "@/src/lib/validation";

export interface ListDraft {
  name: string;
  description: string;
  visibility: Visibility;
}

interface ListEditorProps {
  visible: boolean;
  title: string;
  initial?: Partial<ListDraft>;
  submitLabel: string;
  onSubmit: (draft: ListDraft) => Promise<void>;
  onClose: () => void;
}

/**
 * Create / edit a watchlist's name, description and visibility.
 * The form only exists while open, so its state is initialized synchronously
 * from `initial` every time it opens (no reset effect racing user input).
 */
export function ListEditorSheet(props: ListEditorProps) {
  return props.visible ? <ListEditorForm {...props} /> : null;
}

function ListEditorForm({ title, initial, submitLabel, onSubmit, onClose }: ListEditorProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? "friends");
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const problem = validateListName(name);
    if (problem) {
      setNameError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ name, description, visibility });
      onClose();
    } catch (e) {
      setError(e instanceof Error && e.name === "LibraryError" ? e.message : friendlyError(e, "Couldn't save the list."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title={title}
      testID="list-editor"
      footer={
        <>
          <Button title="Cancel" variant="outline" onPress={onClose} />
          <Button title={submitLabel} onPress={submit} loading={saving} testID="list-editor-submit" />
        </>
      }
    >
      <TextField
        label="Name"
        value={name}
        onChangeText={(t) => {
          setName(t);
          setNameError(null);
        }}
        placeholder="e.g. Sci-fi to watch"
        maxLength={LIMITS.listName}
        error={nameError}
        autoFocus
        testID="list-name-input"
        onSubmitEditing={submit}
      />
      <TextField
        label="Description (optional)"
        value={description}
        onChangeText={setDescription}
        placeholder="What's this list for?"
        multiline
        maxLength={LIMITS.listDescription}
        testID="list-description-input"
      />
      <AppText variant="label">Who can see it</AppText>
      <ChipRow>
        <Chip label="Friends" icon="group" selected={visibility === "friends"} onPress={() => setVisibility("friends")} testID="visibility-friends" />
        <Chip label="Only me" icon="lock" selected={visibility === "private"} onPress={() => setVisibility("private")} testID="visibility-private" />
      </ChipRow>
      <AppText variant="caption">
        {visibility === "friends"
          ? "Your friends can see this list and compare it with theirs."
          : "Private lists are never shared or included in comparisons."}
      </AppText>
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </Sheet>
  );
}
