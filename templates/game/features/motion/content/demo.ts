import { defineContent, defineContentType, t } from '@lunego/core'

export const DemoText = defineContentType('DemoText', {
  text: t.str,
})

export const DemoContent = defineContent(DemoText, {
  title: { text: 'Status' },
})
