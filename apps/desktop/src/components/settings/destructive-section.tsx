import { useState, type ReactElement } from 'react'
import { errorMessage } from '@dayjot/core'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useGraph } from '@/providers/graph-provider'
import { SettingsField } from './field'
import { RebuildIndexField } from './rebuild-index-field'
import { SettingsSection } from './section'

export function DestructiveSection(): ReactElement {
  const { graph, forget, deleteGraph } = useGraph()
  const [confirming, setConfirming] = useState(false)
  const [forgetting, setForgetting] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteName, setDeleteName] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const graphId = graph?.root ?? 'this notebook'
  const graphName = graph?.name ?? ''
  // GitHub-style guard: the delete button stays dead until the typed name
  // matches the graph's folder name exactly.
  const nameConfirmed = graph !== null && deleteName === graph.name

  const forgetGraph = async (): Promise<void> => {
    if (graph === null || forgetting) {
      return
    }
    setForgetting(true)
    try {
      await forget(graph.root)
      setConfirming(false)
    } finally {
      setForgetting(false)
    }
  }

  const openDeleteDialog = (): void => {
    setDeleteName('')
    setDeleteError(null)
    setConfirmingDelete(true)
  }

  const deleteGraphToTrash = async (): Promise<void> => {
    if (!nameConfirmed || deleting) {
      return
    }
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteGraph()
      setConfirmingDelete(false)
    } catch (err) {
      setDeleteError(errorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <SettingsSection id="destructive">
        <RebuildIndexField />
        <SettingsField
          legend="Saved notebook"
          description="Forget this notebook. Files stay on disk."
        >
          <div className="mt-3 flex justify-start">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={graph === null || forgetting}
              onClick={() => setConfirming(true)}
            >
              Forget notebook
            </Button>
          </div>
        </SettingsField>
        <SettingsField
          legend="Delete notebook"
          description="Move this notebook and all of its notes to the trash."
        >
          <div className="mt-3 flex justify-start">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={graph === null || deleting}
              onClick={openDeleteDialog}
            >
              Delete notebook
            </Button>
          </div>
        </SettingsField>
      </SettingsSection>

      <Dialog open={confirming} onOpenChange={(open) => !forgetting && setConfirming(open)}>
        <DialogContent>
          <DialogTitle>Forget notebook?</DialogTitle>
          <DialogDescription className="min-w-0">
            Remove{' '}
            <span className="font-mono text-text [overflow-wrap:anywhere]">{graphId}</span> from
            saved notebooks. Files stay on disk.
          </DialogDescription>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" disabled={forgetting}>
                Cancel
              </Button>
            </DialogClose>
            <Button variant="destructive" disabled={forgetting} onClick={() => void forgetGraph()}>
              {forgetting ? 'Forgetting…' : 'Forget notebook'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmingDelete}
        onOpenChange={(open) => !deleting && setConfirmingDelete(open)}
      >
        <DialogContent>
          <DialogTitle>Delete notebook?</DialogTitle>
          <DialogDescription className="min-w-0">
            Move{' '}
            <span className="font-mono text-text [overflow-wrap:anywhere]">{graphId}</span> and
            all of its notes to the trash. Type{' '}
            <span className="font-mono text-text">{graphName}</span> to confirm.
          </DialogDescription>
          <Input
            aria-label="Notebook name"
            placeholder={graphName}
            value={deleteName}
            autoComplete="off"
            spellCheck={false}
            disabled={deleting}
            onChange={(event) => setDeleteName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void deleteGraphToTrash()
              }
            }}
          />
          {deleteError !== null && (
            <p role="alert" className="text-xs text-destructive">
              {deleteError}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" disabled={deleting}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={!nameConfirmed || deleting}
              onClick={() => void deleteGraphToTrash()}
            >
              {deleting ? 'Deleting…' : 'Delete notebook'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
