import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import * as staticEnv from '$env/static/private';
import { dev } from '$app/environment';

export const load: LayoutServerLoad = () => {
  if (!dev && !staticEnv.PLAYWRIGHT) {
    error(404, 'Not found');
  }

  return {};
};
