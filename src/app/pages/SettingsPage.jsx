import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "../components/Card";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Badge } from "../components/Badge";
import {
  User,
  Bell,
  Key,
  CreditCard,
  Webhook,
  Moon,
  Sun,
  Check,
  Monitor,
  AlertTriangle,
} from "lucide-react";
import { getCurrentUser, updateProfile } from "../services/authService";

export function SettingsPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [bio, setBio] = useState("");
  const [savedProfile, setSavedProfile] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const user = getCurrentUser();
    if (user) {
      setFullName(user.fullName || "");
      setEmail(user.email || "");
      setBio(user.bio || "");
    }
  }, []);

  const [theme, setTheme] = useState("dark");

  const [notifications, setNotifications] = useState({
    email: true,
    analysisComplete: true,
    weeklyReports: true,
  });

  const [apiKeys, setApiKeys] = useState([
    { id: 1, key: "sk_live_••••••••••••••••4f8a", created: "30 days ago" },
  ]);

  const [integrations, setIntegrations] = useState({
    GitHub: true,
    GitLab: false,
    Slack: true,
    Discord: false,
  });

  const handleSaveProfile = async () => {
    setErrorMessage("");
    setIsSaving(true);
    try {
      await updateProfile({ fullName, email, bio });
      setSavedProfile(true);
      setTimeout(() => setSavedProfile(false), 2000);
      window.dispatchEvent(new Event("userProfileUpdated"));
    } catch (err) {
      setErrorMessage(err.message || "Failed to update profile.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    const user = getCurrentUser();
    if (user) {
      setFullName(user.fullName || "");
      setEmail(user.email || "");
      setBio(user.bio || "");
      setErrorMessage("");
    }
  };

  const handleToggleNotification = (key) => {
    setNotifications((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleGenerateKey = () => {
    const newKey = {
      id: Date.now(),
      key: `sk_live_${"•".repeat(16)}${Math.random().toString(36).slice(2, 6)}`,
      created: "Just now",
    };
    setApiKeys((prev) => [...prev, newKey]);
  };

  const handleRevokeKey = (id) => {
    setApiKeys((prev) => prev.filter((k) => k.id !== id));
  };

  const handleToggleIntegration = (name) => {
    setIntegrations((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const notificationItems = [
    { key: "email", title: "Email Notifications", description: "Receive email updates about your repositories" },
    { key: "analysisComplete", title: "Analysis Complete", description: "Get notified when repository analysis is finished" },
    { key: "weeklyReports", title: "Weekly Reports", description: "Receive weekly summary of your activity" },
  ];

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Settings</h1>
        <p className="text-muted-foreground">Manage your account and preferences</p>
      </div>

      {/* Profile Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Profile
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-6">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white text-2xl font-bold">
                {fullName ? fullName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() : "U"}
              </div>
              <div>
                <Button variant="outline" size="sm">Change Avatar</Button>
                <p className="text-xs text-muted-foreground mt-2">JPG, PNG or GIF. Max size 2MB.</p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="settings-full-name" className="block text-sm mb-2">Full Name</label>
                <Input
                  id="settings-full-name"
                  name="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="settings-email" className="block text-sm mb-2">Email</label>
                <Input
                  id="settings-email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label htmlFor="settings-bio" className="block text-sm mb-2">Bio</label>
              <textarea
                id="settings-bio"
                name="bio"
                placeholder="Tell us about yourself..."
                value={bio}
                onChange={(e) => setBio(e.target.value)}
              />
            </div>

            {errorMessage && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-2.5 text-red-400 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Failed to save profile</span>
                  <p className="mt-0.5 opacity-90">{errorMessage}</p>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
                Cancel
              </Button>
              <Button onClick={handleSaveProfile} className="gap-2" disabled={isSaving}>
                {savedProfile && <Check className="w-4 h-4" />}
                {isSaving ? "Saving..." : savedProfile ? "Saved!" : "Save Changes"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Moon className="w-5 h-5" />
            Appearance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <label className="block text-sm mb-3">Theme</label>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { name: "Light", value: "light", icon: Sun },
                  { name: "Dark", value: "dark", icon: Moon },
                  { name: "System", value: "system", icon: Monitor },
                ].map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTheme(t.value)}
                    className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                      theme === t.value
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-muted-foreground"
                    }`}
                  >
                    <t.icon className="w-6 h-6 mx-auto mb-2" />
                    <div className="text-sm font-medium">{t.name}</div>
                    {theme === t.value && <Check className="w-4 h-4 text-primary mx-auto mt-2" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Notifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {notificationItems.map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between p-4 rounded-xl hover:bg-muted/50 transition-all"
              >
                <div>
                  <div className="font-medium mb-1">{item.title}</div>
                  <div className="text-sm text-muted-foreground">{item.description}</div>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleNotification(item.key)}
                  className={`relative w-12 h-6 rounded-full transition-all cursor-pointer ${
                    notifications[item.key] ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <div
                    className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-all ${
                      notifications[item.key] ? "translate-x-6" : ""
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* API Keys */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5" />
            API Keys
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {apiKeys.map((k) => (
              <div key={k.id} className="p-4 rounded-xl bg-muted/50 flex items-center justify-between">
                <div>
                  <div className="font-mono text-sm mb-1">{k.key}</div>
                  <div className="text-sm text-muted-foreground">Created {k.created}</div>
                </div>
                <Button variant="outline" size="sm" onClick={() => handleRevokeKey(k.id)}>
                  Revoke
                </Button>
              </div>
            ))}
            <Button variant="outline" className="gap-2" onClick={handleGenerateKey}>
              <Key className="w-4 h-4" />
              Generate New Key
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Integrations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="w-5 h-5" />
            Integrations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { name: "GitHub", icon: "🐙" },
              { name: "GitLab", icon: "🦊" },
              { name: "Slack", icon: "💬" },
              { name: "Discord", icon: "🎮" },
            ].map((integration) => (
              <div
                key={integration.name}
                className="flex items-center justify-between p-4 rounded-xl bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <div className="text-2xl">{integration.icon}</div>
                  <div>
                    <div className="font-medium mb-1">{integration.name}</div>
                    <Badge variant={integrations[integration.name] ? "success" : "default"}>
                      {integrations[integration.name] ? "Connected" : "Not Connected"}
                    </Badge>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleToggleIntegration(integration.name)}
                >
                  {integrations[integration.name] ? "Disconnect" : "Connect"}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-500/50">
        <CardHeader>
          <CardTitle className="text-red-500">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 rounded-xl bg-red-500/10">
              <div>
                <div className="font-medium mb-1">Delete Account</div>
                <div className="text-sm text-muted-foreground">
                  Permanently delete your account and all data
                </div>
              </div>
              <Button
                variant="outline"
                className="text-red-500 border-red-500 hover:bg-red-500/10"
                onClick={() => {
                  if (window.confirm("Are you sure you want to delete your account? This cannot be undone.")) {
                    alert("Account deletion is disabled in demo mode.");
                  }
                }}
              >
                Delete Account
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
