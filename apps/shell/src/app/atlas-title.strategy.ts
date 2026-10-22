import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

/** Suffix every route carries, so a tab is identifiable among twenty others. */
const PRODUCT = 'Atlas Admin';

/**
 * Every route used to render the same document title, and that title was the
 * literal string `shell` — the Angular project name, straight out of the
 * generated index.html. On the deployed console the browser tab said "shell".
 *
 * That matters more here than it would elsewhere. PRODUCT.md records that the
 * primary audience meets this product by opening the live URL cold, with other
 * tabs already open; the tab label is part of the first impression, and it is
 * also the only thing distinguishing two open routes in a history list or a
 * window switcher.
 *
 * Route titles come from the manifest's `displayName`, so a remote renamed
 * there renames its tab too — no shell rebuild, consistent with ADR-0004.
 */
@Injectable({ providedIn: 'root' })
export class AtlasTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const route = this.buildTitle(snapshot);
    this.title.setTitle(route ? `${route} · ${PRODUCT}` : PRODUCT);
  }
}
