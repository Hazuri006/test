using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Text;
using Peek.App.Interop;
using Peek.Core.Windows;

namespace Peek.App.Windows;

/// <summary>
/// Enumere les fenetres de premier plan que l'utilisateur pourrait vouloir
/// viser.
///
/// L'enumeration est sur le chemin critique : elle a lieu au moment ou la
/// touche est enfoncee, et le voile a 80 ms pour apparaitre. Elle est donc
/// faite d'un seul parcours, et les noms de processus sont resolus en une fois
/// plutot qu'un par un.
/// </summary>
internal static class WindowFinder
{
    /// <summary>
    /// Les fenetres visibles, dans l'ordre d'affichage, la plus en avant
    /// d'abord — c'est l'ordre que <c>EnumWindows</c> garantit, et celui dont
    /// WindowMatcher a besoin pour departager deux fenetres du meme programme.
    /// </summary>
    internal static IReadOnlyList<WindowInfo> TopLevelWindows()
    {
        var names = new Dictionary<uint, string>(32);
        var found = new List<WindowInfo>(32);
        var title = new StringBuilder(256);

        NativeMethods.EnumWindows(
            (handle, _) =>
            {
                if (!IsCandidate(handle))
                {
                    return true;
                }

                var length = NativeMethods.GetWindowTextLengthW(handle);

                if (length <= 0)
                {
                    return true;
                }

                title.Clear();
                title.EnsureCapacity(length + 1);
                NativeMethods.GetWindowTextW(handle, title, title.Capacity);

                NativeMethods.GetWindowThreadProcessId(handle, out var processId);

                found.Add(new WindowInfo(
                    handle.ToInt64(),
                    ProcessName(names, processId),
                    title.ToString()));

                return true;
            },
            IntPtr.Zero);

        return found;
    }

    private static bool IsCandidate(IntPtr handle)
    {
        if (!NativeMethods.IsWindowVisible(handle))
        {
            return false;
        }

        // Fenetre-fille ou fenetre appartenant a une autre : seule la racine
        // interesse l'utilisateur.
        if (NativeMethods.GetAncestor(handle, NativeMethods.GaRootOwner) != handle)
        {
            return false;
        }

        var style = NativeMethods.GetExtendedStyle(handle);

        // Une fenetre outil n'apparait pas dans Alt-Tab ; elle n'a rien a faire
        // dans une liste de fenetres a viser non plus.
        if ((style & NativeMethods.WsExToolWindowStyle) != 0
            && (style & NativeMethods.WsExAppWindow) == 0)
        {
            return false;
        }

        // Les applications du Store laissent trainer des fenetres presentes mais
        // jamais rendues. Elles passent IsWindowVisible, et elles n'existent pas.
        if (NativeMethods.DwmGetWindowAttribute(
                handle,
                NativeMethods.DwmwaCloaked,
                out int cloaked,
                sizeof(int)) == 0
            && cloaked != 0)
        {
            return false;
        }

        return true;
    }

    /// <summary>
    /// Nom du processus d'une fenetre, memorise le temps de l'enumeration.
    ///
    /// Resolu a la demande : un navigateur ouvre douze fenetres pour un seul
    /// processus, et le systeme en compte trois cents dont Peek n'a que faire.
    /// Enumerer tout le systeme couterait plusieurs millisecondes sur un chemin
    /// qui en a quatre-vingts en tout.
    ///
    /// I8 : c'est la meme information que celle qu'affiche le gestionnaire des
    /// taches. Aucun descripteur n'est ouvert sur le processus vise, et rien de
    /// sa memoire n'est lu.
    /// </summary>
    private static string ProcessName(Dictionary<uint, string> memo, uint processId)
    {
        if (memo.TryGetValue(processId, out var known))
        {
            return known;
        }

        var name = string.Empty;

        try
        {
            using var process = Process.GetProcessById((int)processId);
            name = process.ProcessName;
        }
        catch (Exception ex) when (ex is ArgumentException or InvalidOperationException)
        {
            // Processus termine entre l'enumeration et la lecture.
        }

        memo[processId] = name;
        return name;
    }
}
