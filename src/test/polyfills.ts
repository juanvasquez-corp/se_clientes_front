/// <reference types="node" />

import {
  TransformStream as NodeTransformStream,
  WritableStream as NodeWritableStream,
} from 'node:stream/web'

Object.defineProperty(globalThis, 'TransformStream', {
  configurable: true,
  value: NodeTransformStream,
  writable: true,
})

Object.defineProperty(globalThis, 'WritableStream', {
  configurable: true,
  value: NodeWritableStream,
  writable: true,
})
