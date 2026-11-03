"use client";

import { useState } from "react";

export default function SettingsPage() {
  const [saved, setSaved] = useState(false);

  return (
    <div className="dashboard-page">
      <div className="dashboard-heading">
        <div>
          <p className="eyebrow">Organization</p>
          <h1 className="dashboard-title">Settings</h1>
          <p className="route-intro">Manage issuer details shown on certificates.</p>
        </div>
      </div>
      <form className="dashboard-panel field-stack settings-form" onSubmit={(event) => { event.preventDefault(); setSaved(true); }}>
        <label htmlFor="settings-organization">Organization name</label>
        <input id="settings-organization" defaultValue="Northline Learning Lab" />
        <label htmlFor="settings-email">Official email</label>
        <input id="settings-email" type="email" defaultValue="credentials@northline.example" />
        <label htmlFor="settings-website">Website</label>
        <input id="settings-website" type="url" defaultValue="https://northline.example" />
        <button className="action action-primary" type="submit">Save changes</button>
        {saved && <p className="form-message form-success" role="status">Saved in this preview only.</p>}
      </form>
    </div>
  );
}
