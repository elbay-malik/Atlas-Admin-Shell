import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  imports: [RouterModule],
  selector: 'iam-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected title = 'iam';
}
