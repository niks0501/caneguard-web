import { useState } from "react";
import { AlertTriangle, CheckCircle2, Smartphone, Trash2 } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ApiError } from "../../api/ApiError";
import { Button } from "../../components/ui/Button";
import { LoadingState } from "../../components/ui/States";
import { formatDateTime } from "../../lib/formatters";
import { listMobileDevices, revokeMobileDevice } from "../../services/account.api";

export function DevicesSettings() {
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [deviceSuccess, setDeviceSuccess] = useState<string | null>(null);

  const devicesQuery = useQuery({
    queryKey: ["account", "devices"],
    queryFn: listMobileDevices,
  });

  const revokeMutation = useMutation({
    mutationFn: revokeMobileDevice,
    onSuccess: (data) => {
      void devicesQuery.refetch();
      setDeviceSuccess(data.message || "Device revoked successfully.");
      setDeviceError(null);
    },
    onError: (error) => {
      setDeviceError(
        error instanceof ApiError ? error.message : "Failed to revoke mobile device.",
      );
      setDeviceSuccess(null);
    },
  });

  const handleRevoke = (deviceId: number) => {
    if (
      window.confirm(
        "Are you sure you want to revoke this mobile device? The inspector will be signed out immediately.",
      )
    ) {
      revokeMutation.mutate(deviceId);
    }
  };

  return (
    <section className="settings-card" aria-labelledby="devices-heading">
      <div className="section-heading">
        <h2 id="devices-heading">Connected mobile devices</h2>
        <Smartphone aria-hidden="true" />
      </div>

      <p className="settings-card__description">
        Active Android field-inspection devices enrolled under this account. Revoking a device immediately invalidates its offline sync token.
      </p>

      {deviceError ? (
        <div className="govuk-error-summary" role="alert" tabIndex={-1}>
          <h2 className="govuk-error-summary__title">There is a problem</h2>
          <div className="govuk-error-summary__body">
            <ul className="govuk-error-summary__list">
              <li>{deviceError}</li>
            </ul>
          </div>
        </div>
      ) : null}

      {deviceSuccess ? (
        <div className="settings-alert settings-alert--success" role="status">
          <CheckCircle2 aria-hidden="true" />
          <span>{deviceSuccess}</span>
        </div>
      ) : null}

      {devicesQuery.isLoading ? (
        <LoadingState message="Loading enrolled devices..." />
      ) : devicesQuery.isError ? (
        <div className="settings-alert settings-alert--error" role="alert">
          <AlertTriangle aria-hidden="true" />
          <span>Failed to load registered mobile devices.</span>
        </div>
      ) : devicesQuery.data && devicesQuery.data.length > 0 ? (
        <ul className="settings-devices">
          {devicesQuery.data.map((device) => (
            <li key={device.id} className="settings-device">
              <Smartphone aria-hidden="true" className="settings-device__icon" />
              <div className="settings-device__meta">
                <strong>{device.deviceName}</strong>
                {device.isCurrent ? (
                  <span className="current-device-tag"> (Current session)</span>
                ) : null}
                <span className="machine-text">{device.deviceId ?? "Not recorded"}</span>
                <span className="settings-device__times">
                  Registered {device.createdAt ? formatDateTime(device.createdAt) : "Unknown"}
                  {" · "}
                  Last active {device.lastUsedAt ? formatDateTime(device.lastUsedAt) : "Never"}
                </span>
              </div>
              <Button
                type="button"
                variant="danger"
                icon={<Trash2 aria-hidden="true" />}
                disabled={revokeMutation.isPending}
                onClick={() => handleRevoke(device.id)}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="settings-empty">No mobile inspection devices are currently enrolled.</p>
      )}
    </section>
  );
}
