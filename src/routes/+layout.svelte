<script lang="ts">
  import '../app.css';

  import { Button } from '$lib/components/ui/button/index';
  import * as Sheet from '$lib/components/ui/sheet/index';
  import * as AlertDialog from '$lib/components/ui/alert-dialog/index';

  import FlaskConical from 'lucide-svelte/icons/flask-conical';
  import Menu from 'lucide-svelte/icons/menu';
  import Settings from 'lucide-svelte/icons/settings';

  import Home from 'lucide-svelte/icons/house';
  import ConfigIcon from 'lucide-svelte/icons/file-code';
  import DocumentationIcon from 'lucide-svelte/icons/book-open';
  import SettingsDialog from '$lib/components/SettingsDialog.svelte';
  import { validEnvStore } from '$lib/state/derived';
  import FolderPicker from '$lib/components/FolderPicker.svelte';
  import { cn } from '$lib/utils/shadcn';
  import { page } from '$app/stores';
  import { alertStore } from '$lib/state/ui';

  const links = [
    { name: 'Dashboard', href: '/', icon: Home },
    { name: 'Configuration', href: '/configuration', icon: ConfigIcon },
    { name: 'Documentation', href: '/documentation', icon: DocumentationIcon },
  ];

  let settingsOpen = false;

  function handleAlertOpenChange(open: boolean) {
    if (!open && $alertStore) {
      $alertStore.callback(false);
      alertStore.set(null);
    }
  }
</script>

<!-- <main>
	<slot></slot>
</main> -->

<div class="grid h-screen w-full md:grid-cols-[220px_1fr]">
  <div class="hidden border-r bg-muted/40 md:block">
    <div class="flex h-full max-h-screen flex-col gap-2">
      <div class="flex h-14 items-center border-b px-4">
        <a href="/" class="flex items-center gap-2 font-semibold">
          <FlaskConical class="h-6 w-6" />
          <span class="">Evals</span>
        </a>
      </div>
      <div class="flex-1">
        <nav class="grid items-start px-2 text-sm font-medium">
          {#each links as { name, href, icon }, i}
            <a
              {href}
              class={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary',
                href === $page.url.pathname ? 'bg-slate-200' : '',
              )}
            >
              {#if icon}
                <svelte:component this={icon} class="h-4 w-4" />
              {/if}
              {name}
            </a>
          {/each}
        </nav>
      </div>
    </div>
  </div>
  <div class="flex flex-col overflow-hidden">
    <header class="flex h-14 items-center gap-4 border-b bg-muted/40 px-4">
      <Sheet.Root>
        <Sheet.Trigger asChild let:builder>
          <Button variant="outline" size="icon" class="shrink-0 md:hidden" builders={[builder]}>
            <Menu class="h-5 w-5" />
            <span class="sr-only">Toggle navigation menu</span>
          </Button>
        </Sheet.Trigger>
        <Sheet.Content side="left" class="flex flex-col">
          <nav class="grid gap-2 text-lg font-medium">
            <a href="##" class="flex items-center gap-2 text-lg font-semibold">
              <FlaskConical class="h-6 w-6" />
              <span class="sr-only">Evals</span>
            </a>
            {#each links as { name, href, icon }, i}
              <Sheet.Close asChild let:builder>
                <a
                  use:builder.action
                  {href}
                  class="mx-[-0.65rem] flex items-center gap-4 rounded-xl px-3 py-2 text-muted-foreground hover:text-foreground"
                >
                  {#if icon}
                    <svelte:component this={icon} class="h-4 w-4" />
                  {/if}
                  {name}
                </a>
              </Sheet.Close>
            {/each}
          </nav>
        </Sheet.Content>
      </Sheet.Root>
      <div class="w-full flex-1">
        <FolderPicker></FolderPicker>
        <!-- Search box -->
        <!-- <form>
					<div class="relative">
						<Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
						<Input
							type="search"
							placeholder="Search..."
							class="w-full appearance-none bg-background pl-8 shadow-none md:w-2/3 lg:w-1/3"
						/>
					</div>
				</form> -->
      </div>
      <Button
        variant="secondary"
        size="icon"
        class="rounded-full"
        on:click={() => (settingsOpen = true)}
      >
        <Settings class="h-5 w-5" />
        <span class="sr-only">Toggle user menu</span>
      </Button>
    </header>
    <main class="flex flex-1 flex-col gap-4 overflow-scroll p-4">
      <slot></slot>
    </main>
  </div>
</div>

<AlertDialog.Root open={$alertStore !== null} onOpenChange={handleAlertOpenChange}>
  <AlertDialog.Content id={$alertStore?.id ?? 'alert-dialog'}>
    <AlertDialog.Header>
      <AlertDialog.Title>{$alertStore?.title ?? 'Error'}</AlertDialog.Title>
      <AlertDialog.Description>
        {#each $alertStore?.description ?? [] as description}
          <p>{description}</p>
        {:else}
          <p>An unknown error occurred.</p>
        {/each}
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      {#if $alertStore?.cancelText !== null}
        <AlertDialog.Cancel>{$alertStore?.cancelText ?? 'Cancel'}</AlertDialog.Cancel>
      {/if}
      <AlertDialog.Action on:click={() => $alertStore?.callback(true)}
        >{$alertStore?.confirmText ?? 'Continue'}</AlertDialog.Action
      >
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

<SettingsDialog
  open={settingsOpen || !$validEnvStore}
  canClose={$validEnvStore}
  on:open-change={(e) => (settingsOpen = e.detail)}
></SettingsDialog>
