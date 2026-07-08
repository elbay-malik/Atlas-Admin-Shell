import { Component } from '@angular/core';
import { ShellLayout } from './layout/shell-layout';

@Component({
  imports: [ShellLayout],
  selector: 'shell-root',
  template: '<shell-layout />',
})
export class App {}
