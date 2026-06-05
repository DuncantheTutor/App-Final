import * as VideoThumbnails from "expo-video-thumbnails";

import { useEffect, useState } from "react";



type PosterCacheEntry = {

  uri: string;

  width?: number;

  height?: number;

};



const posterCache = new Map<string, PosterCacheEntry>();

const posterInFlight = new Map<string, Promise<PosterCacheEntry | undefined>>();



async function loadPosterEntry(videoUri: string): Promise<PosterCacheEntry | undefined> {

  const cached = posterCache.get(videoUri);

  if (cached) return cached;



  const pending = posterInFlight.get(videoUri);

  if (pending) return pending;



  const work = VideoThumbnails.getThumbnailAsync(videoUri, { time: 0, quality: 0.65 })

    .then((result) => {

      const uri = result.uri?.trim();

      if (!uri) return undefined;

      const entry: PosterCacheEntry = {

        uri,

        width: result.width > 0 ? result.width : undefined,

        height: result.height > 0 ? result.height : undefined,

      };

      posterCache.set(videoUri, entry);

      return entry;

    })

    .catch(() => undefined)

    .finally(() => {

      if (posterInFlight.get(videoUri) === work) {

        posterInFlight.delete(videoUri);

      }

    });



  posterInFlight.set(videoUri, work);

  return work;

}



export type VideoPosterState = {

  posterUri?: string;

  width?: number;

  height?: number;

};



/** First-frame still + display dimensions for inline chat video bubbles. */

export function useVideoPoster(videoUri: string | undefined, enabled = true): VideoPosterState {

  const [state, setState] = useState<VideoPosterState>(() => {

    if (!enabled || !videoUri?.trim()) return {};

    const cached = posterCache.get(videoUri.trim());

    return cached

      ? { posterUri: cached.uri, width: cached.width, height: cached.height }

      : {};

  });



  useEffect(() => {

    if (!enabled || !videoUri?.trim()) {

      setState({});

      return;

    }

    const trimmed = videoUri.trim();

    const cached = posterCache.get(trimmed);

    if (cached) {

      setState({ posterUri: cached.uri, width: cached.width, height: cached.height });

      return;

    }

    let cancelled = false;

    void loadPosterEntry(trimmed).then((entry) => {

      if (!cancelled && entry) {

        setState({ posterUri: entry.uri, width: entry.width, height: entry.height });

      }

    });

    return () => {

      cancelled = true;

    };

  }, [enabled, videoUri]);



  return state;

}



/** @deprecated Prefer `useVideoPoster`. */

export function useVideoPosterUri(videoUri: string | undefined, enabled = true): string | undefined {

  return useVideoPoster(videoUri, enabled).posterUri;

}


